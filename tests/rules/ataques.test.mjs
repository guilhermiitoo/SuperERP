// Cliente malicioso: gravações feitas direto no banco, sem passar pela tela.
// Cada tentativa precisa ser negada pelas regras do servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, customer, denied, testSettings, service, HOUR } from './_env.mjs';
import { slotIn, range } from './_helpers.mjs';
import { planCreate, planCancel, planReschedule } from '../../public/js/core/booking.js';
import { planWrites, commitWrites } from '../../public/js/data/firebase.js';
import { randomToken, newBid } from '../../public/js/core/ids.js';

let env;
let owner;
before(async () => { env = await makeEnv(); owner = await env.install(); });
after(async () => { await env.cleanup(); });

const dayOf = async (store, day) => (await store.loadDays(day, day))[day];
const clone = (x) => JSON.parse(JSON.stringify(x));
const stillHeld = (dayDoc, booking) => range(booking.start, booking.n).every((k) => dayDoc.busy[k] === true);

/** Monta as gravações de uma reserva válida, para depois adulterar. */
async function validCreate(c, slot, over = {}) {
  const { settings, services } = await c.store.loadBusiness();
  const dayDoc = await dayOf(c.store, slot.day);
  const plan = planCreate({
    dayDoc, settings, service: services.find((s) => s.id === (over.serviceId || 'mao')), start: slot.start,
    customer: customer(1), source: 'public', nowMs: Date.now(), token: randomToken(), bid: newBid(),
  });
  return { plan, writes: planWrites(plan), dayDoc, settings };
}
const send = (c, writes) => commitWrites(c.db, env.fs, writes);
const byPath = (writes, prefix) => writes.find((w) => w.path.startsWith(prefix));

test('controle: as gravações de uma reserva válida são aceitas', async () => {
  const v = env.newClient();
  const { writes, plan } = await validCreate(v, slotIn(26));
  await send(v, writes);
  assert.equal((await v.store.getBooking(plan.booking.token)).status, 'confirmed');
});

test('reserva sem ocupar os átomos do dia é negada', async () => {
  const v = env.newClient();
  const { writes } = await validCreate(v, slotIn(28));
  await denied(send(v, writes.filter((w) => !w.path.startsWith('agendas/'))));
});

test('ocupar átomos sem gravar a reserva é negado', async () => {
  const v = env.newClient();
  const { writes } = await validCreate(v, slotIn(28));
  await denied(send(v, writes.filter((w) => w.path.startsWith('agendas/'))));
});

test('reserva sem o índice privado (locks) é negada', async () => {
  const v = env.newClient();
  const { writes } = await validCreate(v, slotIn(28));
  await denied(send(v, writes.filter((w) => !w.path.startsWith('locks/'))));
});

test('ocupar menos átomos do que o serviço exige é negado', async () => {
  const v = env.newClient();
  const slot = slotIn(28);
  const { writes } = await validCreate(v, slot);
  const w = clone(writes);
  byPath(w, 'bookings/').data.n = 3;
  const day = byPath(w, 'agendas/');
  for (const k of range(slot.start + 3, 8)) delete day.data[`busy.${k}`];
  await denied(send(v, restoreSentinels(w, writes)));
});

test('ocupar átomos além dos da própria reserva é negado', async () => {
  const v = env.newClient();
  const slot = slotIn(28);
  const { writes } = await validCreate(v, slot);
  const w = clone(writes);
  byPath(w, 'agendas/').data[`busy.${(slot.start + 40) % 288}`] = true;
  await denied(send(v, restoreSentinels(w, writes)));
});

test('sobrescrever o horário de outra pessoa é negado mesmo sem transação', async () => {
  const a = env.newClient();
  const slot = slotIn(30);
  const first = await a.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  const b = env.newClient();
  // monta a gravação a partir de uma leitura antiga do dia, como se o horário ainda estivesse livre
  const stale = { ...(await dayOf(b.store, slot.day)), busy: {} };
  const { settings, services } = await b.store.loadBusiness();
  const plan = planCreate({ dayDoc: stale, settings, service: services[0], start: slot.start + 3, customer: customer(2), source: 'public', nowMs: Date.now(), token: randomToken(), bid: newBid() });
  await denied(send(b, planWrites(plan)));
  const d = await dayOf(b.store, slot.day);
  assert.ok(stillHeld(d, first), 'a primeira reserva continua intacta');
  assert.ok(!d.busy[slot.start + first.n + 1], 'nenhum átomo da tentativa negada foi gravado');
});

test('apagar os átomos de outra reserva é negado', async () => {
  const a = env.newClient();
  const slot = slotIn(32);
  const first = await a.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  const b = env.newClient();
  const data = { op: { bid: first.bid, rev: 2 } };
  for (const k of range(slot.start, first.n)) data[`busy.${k}`] = { $delete: true };
  await denied(send(b, [{ kind: 'update', path: `agendas/main/days/${slot.day}`, data }]));
  // nem fingindo ser uma liberação de retenção vencida
  await denied(send(b, [{ kind: 'update', path: `agendas/main/days/${slot.day}`, data: { ...data, op: { bid: first.bid, rev: 0 } } }]));
  assert.ok(stillHeld(await dayOf(b.store, slot.day), first));
});

test('reservar em horário fechado ou em dia fechado é negado', async () => {
  const day = env.dayAhead(6);
  const s = (await owner.store.loadBusiness()).settings;
  await owner.store.saveSettings({ ...s, exceptions: { [day]: { periods: [{ s: 9 * 60, e: 12 * 60 }] }, [env.dayAhead(7)]: { closed: true } } });
  await owner.store.syncDays();
  const v = env.newClient();
  const forge = async (d, start) => {
    const real = await dayOf(v.store, d);
    const { settings, services } = await v.store.loadBusiness();
    const plan = planCreate({ dayDoc: { ...real, shut: false, off: {} }, settings, service: services[0], start, customer: customer(1), source: 'public', nowMs: Date.now(), token: randomToken(), bid: newBid() });
    return planWrites(plan);
  };
  await denied(send(v, await forge(day, 13 * 12)));       // 13:00, fora do expediente
  await denied(send(v, await forge(day, 11 * 12 + 6)));   // 11:30, terminaria depois do meio-dia
  await denied(send(v, await forge(env.dayAhead(7), 10 * 12)));
  await send(v, await forge(day, 9 * 12));                 // dentro do expediente passa
});

test('adulterar preço, duração ou nome do serviço é negado', async () => {
  const v = env.newClient();
  for (const change of [{ price: 1 }, { duration: 5 }, { name: 'Grátis' }, { buffer: 0 }, { id: 'inexistente' }]) {
    const { writes } = await validCreate(v, slotIn(34));
    const w = clone(writes);
    Object.assign(byPath(w, 'bookings/').data.service, change);
    await denied(send(v, restoreSentinels(w, writes)));
  }
});

test('reservar um serviço desativado é negado', async () => {
  await owner.store.saveService(service({ id: 'off', name: 'Desativado', active: false, order: 5 }));
  const v = env.newClient();
  const slot = slotIn(36);
  const { settings } = await v.store.loadBusiness();
  const plan = planCreate({ dayDoc: await dayOf(v.store, slot.day), settings, service: service({ id: 'off', name: 'Desativado', active: true }), start: slot.start, customer: customer(1), source: 'public', nowMs: Date.now(), token: randomToken(), bid: newBid() });
  await denied(send(v, planWrites(plan)));
});

test('forjar estado, origem, modo, prazos ou datas é negado', async () => {
  const v = env.newClient();
  const changes = [
    { status: 'done' }, { status: 'pending' }, { source: 'manual' }, { mode: 'approval' }, { cancelLimitMin: 0 },
    { approvalMin: 99999 }, { rev: 5 }, { endedBy: 'owner' }, { agenda: 'outra' }, { extra: 'campo não previsto' },
    { createdAt: new Date(Date.now() - 86400000) }, { startAt: new Date(Date.now() + 26 * HOUR + 60000) }, { day: env.dayAhead(9) },
  ];
  for (const change of changes) {
    const { writes } = await validCreate(v, slotIn(38));
    const w = restoreSentinels(clone(writes), writes);
    Object.assign(byPath(w, 'bookings/').data, change);
    await denied(send(v, w));
  }
});

test('nome ou telefone fora do formato é negado pelo servidor', async () => {
  const v = env.newClient();
  for (const cust of [{ name: 'A', phone: '92991001000' }, { name: 'Maria', phone: '123' }, { name: 'Maria', phone: '9299100100a' }, { name: 'x'.repeat(500), phone: '92991001000' }, { name: 'Maria', phone: '92991001000', cpf: '000' }]) {
    const { writes } = await validCreate(v, slotIn(40));
    const w = restoreSentinels(clone(writes), writes);
    byPath(w, 'bookings/').data.customer = cust;
    await denied(send(v, w));
  }
});

test('fora da antecedência mínima ou da janela máxima é negado pelo servidor', async () => {
  const v = env.newClient();
  const { settings, services } = await v.store.loadBusiness();
  const lax = { ...settings, rules: { ...settings.rules, minAdvanceMin: 0, maxDays: 365 } };
  const forge = async (slot) => planWrites(planCreate({ dayDoc: await dayOf(v.store, slot.day), settings: lax, service: services[0], start: slot.start, customer: customer(1), source: 'public', nowMs: Date.now(), token: randomToken(), bid: newBid() }));
  await denied(send(v, await forge(slotIn(1))));
  await denied(send(v, await forge({ day: env.dayAhead(31), start: 120 })));
});

test('com a agenda pausada o servidor nega reserva pública', async () => {
  const paused = await env.install({ rules: { paused: true } });
  const v = env.newClient();
  const slot = slotIn(90);
  const { settings, services } = await v.store.loadBusiness();
  const plan = planCreate({ dayDoc: await dayOf(v.store, slot.day), settings: { ...settings, rules: { ...settings.rules, paused: false } }, service: services[0], start: slot.start, customer: customer(1), source: 'public', nowMs: Date.now(), token: randomToken(), bid: newBid() });
  await denied(send(v, planWrites(plan)));
  // restaura a instalação padrão para os próximos testes
  owner = await env.install();
  assert.ok(paused);
});

test('token curto ou previsível não é aceito como identificador de reserva', async () => {
  const v = env.newClient();
  const { writes, plan } = await validCreate(v, slotIn(42));
  const w = restoreSentinels(clone(writes), writes).map((x) => ({ ...x, path: x.path.replace(plan.booking.token, 'reserva-1') }));
  byPath(w, 'locks/').data.token = 'reserva-1';
  await denied(send(v, w));
});

test('a cliente não consegue cancelar fora do prazo nem mudar campos da própria reserva', async () => {
  const v = env.newClient();
  const slot = slotIn(4);
  const b = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  const stored = await v.store.getBooking(b.token);
  const plan = planCancel({ booking: { ...stored, cancelLimitMin: 0 }, actor: 'customer', nowMs: Date.now() });
  await denied(send(v, planWrites(plan)));
  const base = { rev: 2, updatedAt: { $server: true } };
  for (const data of [{ 'service.price': 1 }, { status: 'done' }, { cancelLimitMin: 0 }, { 'customer.name': 'Outra Pessoa' }, { startAt: new Date() }]) {
    await denied(send(v, [{ kind: 'update', path: `bookings/${b.token}`, data: { ...base, ...data } }]));
  }
  assert.equal((await v.store.getBooking(b.token)).status, 'confirmed');
});

test('remarcar para fora da janela, ou sem liberar o horário antigo, é negado', async () => {
  const v = env.newClient();
  const from = slotIn(44);
  const b = await v.store.createBooking({ serviceId: 'mao', day: from.day, start: from.start, customer: customer(1) });
  const stored = await v.store.getBooking(b.token);
  const { settings } = await v.store.loadBusiness();
  const lax = { ...settings, rules: { ...settings.rules, maxDays: 365 } };
  const farDay = env.dayAhead(40);
  const days = await v.store.loadDays(from.day, farDay);
  const far = planReschedule({ booking: stored, fromDay: days[from.day], toDay: days[farDay], start: 120, actor: 'customer', settings: lax, nowMs: Date.now() });
  await denied(send(v, planWrites(far)));

  const to = slotIn(70);
  const days2 = await v.store.loadDays(from.day, to.day);
  const move = planReschedule({ booking: stored, fromDay: days2[from.day], toDay: days2[to.day], start: to.start, actor: 'customer', settings, nowMs: Date.now() });
  // tenta ficar com os dois horários: grava a reserva e o dia novo, mas não libera o dia antigo
  await denied(send(v, planWrites(move).filter((w) => w.path !== `agendas/main/days/${from.day}`)));
  assert.equal((await v.store.getBooking(b.token)).start, from.start);
});
test('visitante não lista reservas, não lê dados privados e não escreve configuração', async () => {
  const v = env.newClient();
  const { fs } = env;
  const slot = slotIn(46);
  const b = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  await denied(fs.getDocs(fs.collection(v.db, 'bookings')));
  await denied(fs.getDocs(fs.query(fs.collection(v.db, 'bookings'), fs.where('day', '==', slot.day))));
  await denied(fs.getDocs(fs.query(fs.collection(v.db, 'bookings'), fs.where('customer.phone', '==', b.customer.phone))));
  await denied(fs.getDoc(fs.doc(v.db, `locks/${b.bid}`)));
  await denied(fs.getDocs(fs.collection(v.db, 'locks')));
  await denied(fs.getDocs(fs.collection(v.db, 'blocks')));
  await denied(fs.getDocs(fs.collection(v.db, 'owners')));
  await denied(fs.getDoc(fs.doc(v.db, `owners/${owner.uid}`)));
  await denied(fs.setDoc(fs.doc(v.db, 'config/public'), testSettings()));
  await denied(fs.updateDoc(fs.doc(v.db, 'config/public'), { 'rules.paused': true }));
  await denied(fs.setDoc(fs.doc(v.db, 'services/mao'), service({ price: 1 })));
  await denied(fs.deleteDoc(fs.doc(v.db, 'services/mao')));
  await denied(fs.setDoc(fs.doc(v.db, 'blocks/x'), { day: slot.day, s: 0, e: 1440, allDay: true, note: '' }));
  await denied(fs.setDoc(fs.doc(v.db, 'owners/qualquer'), { role: 'owner' }));
  await denied(fs.deleteDoc(fs.doc(v.db, `bookings/${b.token}`)));
  await denied(fs.setDoc(fs.doc(v.db, `agendas/main/days/${env.dayAhead(200)}`), { day: env.dayAhead(200), shut: false, off: {}, busy: {}, holds: {} }));
  await denied(fs.updateDoc(fs.doc(v.db, `agendas/main/days/${slot.day}`), { off: {}, shut: false }));
});

test('o documento público do dia não contém dados pessoais', async () => {
  const v = env.newClient();
  const slot = slotIn(48);
  const b = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(7) });
  const raw = await env.fs.getDoc(env.fs.doc(v.db, `agendas/main/days/${slot.day}`));
  const text = JSON.stringify(raw.data());
  assert.ok(!text.includes(b.customer.phone));
  assert.ok(!text.includes('Cliente'));
  assert.ok(!text.includes(b.token));
  assert.deepEqual(Object.keys(raw.data()).sort(), ['busy', 'day', 'holds', 'off', 'op', 'shut', 'v']);
});

test('uma cliente não acessa nem altera a reserva de outra', async () => {
  const a = env.newClient();
  const b = env.newClient();
  const sa = slotIn(50);
  const sb = slotIn(53);
  const mine = await a.store.createBooking({ serviceId: 'mao', day: sa.day, start: sa.start, customer: customer(1) });
  const hers = await b.store.createBooking({ serviceId: 'mao', day: sb.day, start: sb.start, customer: customer(2) });
  // conhecer o identificador público (bid) da outra reserva não dá acesso a nada
  assert.equal(await a.store.getBooking(hers.bid), null);
  assert.equal(await a.store.getBooking(randomToken()), null);
  // cancelar a reserva da outra usando o próprio token como "prova" é negado
  const forged = planCancel({ booking: { ...(await a.store.getBooking(mine.token)), bid: hers.bid, day: hers.day, start: hers.start }, actor: 'customer', nowMs: Date.now() });
  await denied(send(a, planWrites(forged)));
  assert.equal((await b.store.getBooking(hers.token)).status, 'confirmed');
  assert.ok(stillHeld(await dayOf(b.store, sb.day), hers));
});

test('conta autenticada que não é proprietária não tem acesso administrativo', async () => {
  const stranger = await env.newStranger();
  const { fs } = env;
  const slot = slotIn(56);
  const b = await env.newClient().store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  assert.equal(await stranger.store.isOwner(), false);
  await denied(fs.getDocs(fs.collection(stranger.db, 'bookings')));
  await denied(fs.setDoc(fs.doc(stranger.db, 'config/public'), testSettings()));
  await denied(stranger.store.updateCustomer(b.token, { name: 'Outra Pessoa', phone: '92991112222' }));
  await denied(stranger.store.cancelBooking(b.token, 'owner'));
  await denied(fs.getDocs(fs.collection(stranger.db, 'blocks')));
  const uid = (await stranger.store.currentUser()).uid;
  await denied(fs.setDoc(fs.doc(stranger.db, `owners/${uid}`), { role: 'owner' }));
  assert.equal(await owner.store.isOwner(), true);
});

test('a proprietária também não consegue gravar reserva sobreposta nem apagar átomos na manutenção', async () => {
  const slot = slotIn(58);
  const first = await env.newClient().store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  const stale = { ...(await dayOf(owner.store, slot.day)), busy: {} };
  const { settings, services } = await owner.store.loadBusiness();
  const plan = planCreate({ dayDoc: stale, settings, service: services[0], start: slot.start, customer: customer(2), source: 'manual', nowMs: Date.now(), token: randomToken(), bid: newBid() });
  await denied(send(owner, planWrites(plan)));
  await denied(env.fs.updateDoc(env.fs.doc(owner.db, `agendas/main/days/${slot.day}`), { busy: {} }));
  assert.ok(stillHeld(await dayOf(owner.store, slot.day), first));
});

/** JSON.parse perde os marcadores e datas; devolve-os a partir das gravações originais. */
function restoreSentinels(copy, original) {
  copy.forEach((w, i) => {
    for (const [k, v] of Object.entries(original[i].data)) {
      if (v && typeof v === 'object' && (v.$server || v.$delete || v instanceof Date)) w.data[k] = v;
      if (k.startsWith('holds.') && v && v.c) w.data[k] = { ...w.data[k], c: v.c };
    }
  });
  return copy;
}
