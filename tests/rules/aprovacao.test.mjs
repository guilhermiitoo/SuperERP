// Modo mediante aprovação: pendência, retenção do horário, aprovação, recusa e expiração.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, customer, rejectsWith, denied, HOUR } from './_env.mjs';
import { slotIn, busyKeys, range } from './_helpers.mjs';
import { planReleaseHold } from '../../public/js/core/booking.js';
import { planWrites, commitWrites } from '../../public/js/data/firebase.js';

let env;
before(async () => { env = await makeEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.testEnv.clearFirestore(); });

const approval = { rules: { mode: 'approval', approvalMin: 720 } };
const dayOf = async (store, day) => (await store.loadDays(day, day))[day];

/** Faz a solicitação parecer criada há `hours` horas (o emulador não permite avançar o relógio). */
async function backdate(b, hours) {
  const when = new Date(Date.now() - hours * HOUR);
  await env.admin(async (db) => {
    await db.doc(`bookings/${b.token}`).update({ pendingSince: when, createdAt: when });
    await db.doc(`agendas/main/days/${b.day}`).update({ [`holds.${b.bid}.c`]: when });
  });
}

test('solicitação fica pendente, retém o horário e mostra o prazo', async () => {
  await env.install(approval);
  const v = env.newClient();
  const slot = slotIn(40);
  const b = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  assert.equal(b.status, 'pending');
  const read = await v.store.getBooking(b.token);
  assert.equal(read.status, 'pending');
  assert.equal(read.approvalMin, 720);
  assert.ok(Math.abs(read.pendingSince - Date.now()) < 60000);
  const d = await dayOf(v.store, slot.day);
  assert.deepEqual(busyKeys(d), range(slot.start, 11));
  assert.deepEqual(Object.keys(d.holds), [b.bid]);
  assert.equal(d.holds[b.bid].a, 720);
  await rejectsWith(env.newClient().store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(2) }), 'slot_taken');
});

test('aprovar confirma; recusar libera o horário', async () => {
  const owner = await env.install(approval);
  const v = env.newClient();
  const s1 = slotIn(41);
  const s2 = slotIn(44);
  const a = await v.store.createBooking({ serviceId: 'mao', day: s1.day, start: s1.start, customer: customer(1) });
  const b = await v.store.createBooking({ serviceId: 'mao', day: s2.day, start: s2.start, customer: customer(2) });
  assert.deepEqual((await owner.store.listPending()).map((x) => x.token).sort(), [a.token, b.token].sort());
  assert.equal((await owner.store.approveBooking(a.token)).status, 'confirmed');
  assert.equal((await owner.store.declineBooking(b.token)).status, 'declined');
  assert.equal((await v.store.getBooking(a.token)).status, 'confirmed');
  assert.equal((await v.store.getBooking(b.token)).status, 'declined');
  const d1 = await dayOf(v.store, s1.day);
  assert.deepEqual(d1.holds, {});
  assert.ok(d1.busy[s1.start]);
  const again = await env.newClient().store.createBooking({ serviceId: 'mao', day: s2.day, start: s2.start, customer: customer(3) });
  assert.equal(again.status, 'pending');
});

test('visitante e a própria cliente não conseguem aprovar', async () => {
  await env.install(approval);
  const v = env.newClient();
  const slot = slotIn(46);
  const b = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  await denied(v.store.approveBooking(b.token));
  assert.equal((await v.store.getBooking(b.token)).status, 'pending');
});

test('expiração libera o horário: antes do prazo ninguém libera, depois qualquer visitante libera', async () => {
  const owner = await env.install(approval);
  const v = env.newClient();
  const slot = slotIn(48);
  const b = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  const other = env.newClient();

  // tentativa maliciosa de liberar antes do vencimento
  const dBefore = await dayOf(other.store, slot.day);
  const early = planReleaseHold({ dayDoc: dBefore, bid: b.bid, nowMs: Date.now() + 100 * HOUR, offsetMin: -240 });
  await denied(commitWrites(other.db, env.fs, planWrites(early)));

  await backdate(b, 13);
  assert.equal((await v.store.getBooking(b.token)).effectiveStatus, 'expired');
  // aprovar depois do prazo é negado, pela tela e pelo servidor
  await rejectsWith(owner.store.approveBooking(b.token), 'expired');

  // outro visitante reserva o mesmo horário: a retenção vencida é liberada e a nova reserva entra
  const next = await other.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(2) });
  assert.equal(next.status, 'pending');
  const d = await dayOf(other.store, slot.day);
  assert.deepEqual(Object.keys(d.holds), [next.bid]);
  assert.deepEqual(busyKeys(d), range(slot.start, 11));

  // o painel grava "expirado" na solicitação antiga sem mexer no horário da nova
  const swept = await owner.store.expireBooking(b.token);
  assert.equal(swept.status, 'expired');
  assert.deepEqual(busyKeys(await dayOf(other.store, slot.day)), range(slot.start, 11));
});

test('o servidor nega aprovação fora do prazo mesmo se a tela for burlada', async () => {
  const owner = await env.install(approval);
  const slot = slotIn(50);
  const b = await env.newClient().store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  await backdate(b, 13);
  await denied(commitWrites(owner.db, env.fs, [
    { kind: 'update', path: `bookings/${b.token}`, data: { status: 'confirmed', pendingSince: null, rev: 2, updatedAt: { $server: true } } },
    { kind: 'update', path: `agendas/main/days/${b.day}`, data: { [`holds.${b.bid}`]: { $delete: true }, op: { bid: b.bid, rev: 2 } } },
  ]));
});

test('o painel expira a solicitação vencida e libera o horário quando ninguém liberou antes', async () => {
  const owner = await env.install(approval);
  const slot = slotIn(52);
  const b = await env.newClient().store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  await rejectsWith(owner.store.expireBooking(b.token), 'not_allowed');
  await backdate(b, 13);
  const res = await owner.store.sweepExpired();
  assert.equal(res.expired, 1);
  assert.equal((await owner.store.getBooking(b.token)).status, 'expired');
  const d = await dayOf(owner.store, slot.day);
  assert.deepEqual(busyKeys(d), []);
  assert.deepEqual(d.holds, {});
});

test('reserva perto do horário: o prazo de resposta termina 1 h antes do início', async () => {
  await env.install(approval);
  const v = env.newClient();
  const slot = slotIn(3);
  const b = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  const read = await v.store.getBooking(b.token);
  assert.equal(read.expiresAt, slot.ms - HOUR);
  const tooClose = slotIn(1.2);
  await rejectsWith(v.store.createBooking({ serviceId: 'mao', day: tooClose.day, start: tooClose.start, customer: customer(2) }), 'too_soon');
});

test('mudar o modo de confirmação só afeta reservas novas', async () => {
  const owner = await env.install();
  const v = env.newClient();
  const s1 = slotIn(54);
  const auto = await v.store.createBooking({ serviceId: 'mao', day: s1.day, start: s1.start, customer: customer(1) });
  const s = (await owner.store.loadBusiness()).settings;
  await owner.store.saveSettings({ ...s, rules: { ...s.rules, mode: 'approval' } });
  assert.equal((await v.store.getBooking(auto.token)).status, 'confirmed');
  const s2 = slotIn(57);
  const novo = await env.newClient().store.createBooking({ serviceId: 'mao', day: s2.day, start: s2.start, customer: customer(2) });
  assert.equal(novo.status, 'pending');
  // remarcar a reserva antiga continua seguindo o modo em que ela nasceu
  const s3 = slotIn(80);
  assert.equal((await v.store.rescheduleBooking(auto.token, { day: s3.day, start: s3.start }, 'customer')).status, 'confirmed');
  // remarcar a nova volta a pedir aprovação
  const s4 = slotIn(84);
  await owner.store.approveBooking(novo.token);
  assert.equal((await v.store.rescheduleBooking(novo.token, { day: s4.day, start: s4.start }, 'customer')).status, 'pending');
  const d = await dayOf(v.store, s4.day);
  assert.deepEqual(Object.keys(d.holds), [novo.bid]);
});
