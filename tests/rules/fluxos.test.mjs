// Fluxos reais do aplicativo contra o emulador, com as regras de segurança ligadas.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, customer, rejectsWith, HOUR } from './_env.mjs';
import { slotIn, busyKeys, range, settled } from './_helpers.mjs';
import { addDays } from '../../public/js/core/time.js';

let env;
before(async () => { env = await makeEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.testEnv.clearFirestore(); });

const dayOf = async (store, day) => (await store.loadDays(day, day))[day];

test('instalação: visitante vê o negócio e só os serviços ativos; os dias ficam materializados', async () => {
  const owner = await env.install();
  await owner.store.saveService({ id: 'antigo', name: 'Serviço desativado', description: '', price: 1000, duration: 30, buffer: 0, active: false, order: 9 });
  const visitor = env.newClient();
  const { settings, services } = await visitor.store.loadBusiness();
  assert.equal(settings.business.name, 'Studio Teste (fictício)');
  assert.equal(settings.rules.mode, 'auto');
  assert.deepEqual(services.map((s) => s.id), ['mao', 'gel']);
  const days = await visitor.store.loadDays(env.today(), env.dayAhead(60));
  assert.equal(Object.keys(days).length, 61);
});

test('reserva pública em modo automático é confirmada e pode ser lida pelo link', async () => {
  await env.install();
  const visitor = env.newClient();
  const slot = slotIn(26);
  const b = await visitor.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  assert.equal(b.status, 'confirmed');
  assert.match(b.token, /^[A-Za-z0-9_-]{43}$/);
  const other = env.newClient(); // outro navegador, só com o link
  const read = await other.store.getBooking(b.token);
  assert.equal(read.customer.name, 'Cliente Fictícia 1');
  assert.equal(read.startAt, slot.ms);
  assert.equal(read.service.price, 3500);
  assert.equal(Math.abs(read.createdAt - Date.now()) < 60000, true);
  assert.deepEqual(busyKeys(await dayOf(other.store, slot.day)), range(slot.start, 11));
});

test('duas reservas simultâneas para o mesmo horário: só uma é aceita', async () => {
  await env.install();
  const slot = slotIn(27);
  const clients = Array.from({ length: 5 }, () => env.newClient());
  const { ok, failed } = await settled(clients.map((c, i) => c.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(i) })));
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 4);
  for (const e of failed) assert.equal(e.code, 'slot_taken');
  assert.deepEqual(busyKeys(await dayOf(clients[0].store, slot.day)), range(slot.start, 11));
});

test('reservas simultâneas com inícios e durações diferentes que se cruzam: só uma é aceita', async () => {
  await env.install();
  const slot = slotIn(28);
  const a = env.newClient();
  const b = env.newClient();
  const { ok, failed } = await settled([
    a.store.createBooking({ serviceId: 'gel', day: slot.day, start: slot.start, customer: customer(1) }), // 90 + 10
    b.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start + 12, customer: customer(2) }), // começa 1 h depois
  ]);
  assert.equal(ok.length, 1);
  assert.equal(failed[0].code, 'slot_taken');
  const keys = busyKeys(await dayOf(a.store, slot.day));
  assert.equal(keys.length, ok[0].n);
});

test('serviços de durações diferentes ocupam tempos diferentes e convivem sem se cruzar', async () => {
  await env.install();
  const slot = slotIn(30);
  const v = env.newClient();
  const longo = await v.store.createBooking({ serviceId: 'gel', day: slot.day, start: slot.start, customer: customer(1) });
  assert.equal(longo.n, 20);
  await rejectsWith(v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start + 19, customer: customer(2) }), 'slot_taken');
  const curto = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start + 20, customer: customer(2) });
  assert.equal(curto.n, 11);
});

test('reserva manual concorrendo com reserva pública: só uma é aceita', async () => {
  const owner = await env.install();
  const visitor = env.newClient();
  const slot = slotIn(31);
  const { ok, failed } = await settled([
    owner.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1), source: 'manual' }),
    visitor.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(2) }),
  ]);
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].code, 'slot_taken');
});

test('almoço, bloqueio e fim do expediente não aceitam reserva', async () => {
  const day = env.dayAhead(3);
  const periods = [{ s: 9 * 60, e: 12 * 60 }, { s: 13 * 60, e: 18 * 60 }];
  const owner = await env.install({ exceptions: { [day]: { periods } } });
  await owner.store.saveBlock({ day, s: 15 * 60, e: 16 * 60, allDay: false, note: 'consulta (fictício)' });
  const v = env.newClient();
  const book = (h, m = 0) => v.store.createBooking({ serviceId: 'mao', day, start: (h * 60 + m) / 5, customer: customer(1) });
  await rejectsWith(book(11, 30), 'slot_taken'); // cruzaria o almoço
  await rejectsWith(book(12, 0), 'slot_taken');
  await rejectsWith(book(14, 30), 'slot_taken'); // cruzaria o bloqueio
  await rejectsWith(book(17, 30), 'slot_taken'); // terminaria depois das 18:00
  await rejectsWith(book(8, 0), 'slot_taken');
  const last = await book(17, 15); // termina 18:00; o intervalo pode passar do expediente
  assert.equal(last.n, 9);
});

test('cancelamento libera o horário para outra pessoa', async () => {
  await env.install();
  const slot = slotIn(32);
  const a = env.newClient();
  const b = env.newClient();
  const first = await a.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  await rejectsWith(b.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(2) }), 'slot_taken');
  const cancelled = await a.store.cancelBooking(first.token, 'customer');
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(busyKeys(await dayOf(b.store, slot.day)), []);
  const second = await b.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(2) });
  assert.equal(second.status, 'confirmed');
});

test('remarcação é atômica: se o novo horário não está livre, o original continua reservado', async () => {
  await env.install();
  const from = slotIn(33);
  const to = slotIn(60);
  const a = env.newClient();
  const b = env.newClient();
  const mine = await a.store.createBooking({ serviceId: 'mao', day: from.day, start: from.start, customer: customer(1) });
  await b.store.createBooking({ serviceId: 'mao', day: to.day, start: to.start, customer: customer(2) });
  await rejectsWith(a.store.rescheduleBooking(mine.token, { day: to.day, start: to.start }, 'customer'), 'slot_taken');
  const still = await a.store.getBooking(mine.token);
  assert.equal(still.day, from.day);
  assert.equal(still.start, from.start);
  assert.equal(still.status, 'confirmed');
  const d = await dayOf(a.store, from.day);
  for (const k of range(from.start, 11)) assert.ok(d.busy[k], 'o horário original precisa continuar ocupado');
});

test('remarcação bem-sucedida ocupa o novo horário e libera o antigo, mantendo o mesmo link', async () => {
  await env.install();
  const from = slotIn(34);
  const to = slotIn(62);
  const a = env.newClient();
  const mine = await a.store.createBooking({ serviceId: 'mao', day: from.day, start: from.start, customer: customer(1) });
  const moved = await a.store.rescheduleBooking(mine.token, { day: to.day, start: to.start }, 'customer');
  assert.equal(moved.token, mine.token);
  assert.equal(moved.start, to.start);
  const read = await a.store.getBooking(mine.token);
  assert.equal(read.startAt, to.ms);
  assert.equal(read.rev, 2);
  const oldDay = await dayOf(a.store, from.day);
  for (const k of range(from.start, 11)) assert.ok(!oldDay.busy[k], 'o horário antigo precisa ficar livre');
  const newDay = await dayOf(a.store, to.day);
  for (const k of range(to.start, 11)) assert.ok(newDay.busy[k]);
});

test('remarcação no mesmo dia para um horário que cruza o próprio horário atual', async () => {
  await env.install();
  const from = slotIn(35);
  const a = env.newClient();
  const mine = await a.store.createBooking({ serviceId: 'mao', day: from.day, start: from.start, customer: customer(1) });
  const target = from.start + 6 <= 277 ? { day: from.day, start: from.start + 6 } : { day: from.day, start: from.start - 6 };
  const moved = await a.store.rescheduleBooking(mine.token, target, 'customer');
  assert.deepEqual(busyKeys(await dayOf(a.store, from.day)), range(moved.start, 11));
});

test('remarcação concorrendo com reserva nova para o mesmo horário: uma vence e nada se perde', async () => {
  await env.install();
  const from = slotIn(36);
  const to = slotIn(64);
  const a = env.newClient();
  const b = env.newClient();
  const mine = await a.store.createBooking({ serviceId: 'mao', day: from.day, start: from.start, customer: customer(1) });
  const { ok, failed } = await settled([
    a.store.rescheduleBooking(mine.token, { day: to.day, start: to.start }, 'customer'),
    b.store.createBooking({ serviceId: 'mao', day: to.day, start: to.start, customer: customer(2) }),
  ]);
  assert.equal(ok.length, 1);
  assert.equal(failed[0].code, 'slot_taken');
  const after = await a.store.getBooking(mine.token);
  const target = await dayOf(a.store, to.day);
  const origin = await dayOf(a.store, from.day);
  assert.deepEqual(busyKeys(target), range(to.start, 11));
  if (after.day === from.day) assert.deepEqual(busyKeys(origin).filter((k) => k >= from.start && k < from.start + 11), range(from.start, 11));
  else assert.ok(!origin.busy[from.start]);
});

test('mudar preço e duração do serviço não altera reservas existentes', async () => {
  const owner = await env.install();
  const v = env.newClient();
  const slot = slotIn(37);
  const b = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  await owner.store.saveService({ id: 'mao', name: 'Mão', description: '', price: 5000, duration: 60, buffer: 10, active: true, order: 1 });
  const read = await v.store.getBooking(b.token);
  assert.equal(read.service.price, 3500);
  assert.equal(read.service.duration, 45);
  assert.equal(read.n, 11);
  const next = await env.newClient().store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start + 24, customer: customer(2) });
  assert.equal(next.service.price, 5000);
  assert.equal(next.n, 14);
});

test('pausa de novas reservas bloqueia o link, mantém as reservas e permite reserva manual', async () => {
  const owner = await env.install();
  const v = env.newClient();
  const slot = slotIn(38);
  const kept = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  const s = (await owner.store.loadBusiness()).settings;
  await owner.store.saveSettings({ ...s, rules: { ...s.rules, paused: true } });
  await rejectsWith(env.newClient().store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start + 24, customer: customer(2) }), 'paused');
  assert.equal((await v.store.getBooking(kept.token)).status, 'confirmed');
  const manual = await owner.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start + 24, customer: customer(3), source: 'manual' });
  assert.equal(manual.status, 'confirmed');
});

test('antecedência mínima e janela máxima são aplicadas', async () => {
  await env.install();
  const v = env.newClient();
  const soon = slotIn(1);
  await rejectsWith(v.store.createBooking({ serviceId: 'mao', day: soon.day, start: soon.start, customer: customer(1) }), 'too_soon');
  await rejectsWith(v.store.createBooking({ serviceId: 'mao', day: env.dayAhead(31), start: 120, customer: customer(1) }), 'too_far');
  const edge = await v.store.createBooking({ serviceId: 'mao', day: env.dayAhead(30), start: 120, customer: customer(1) });
  assert.equal(edge.status, 'confirmed');
});

test('a cliente não cancela nem remarca depois do prazo; a proprietária sim', async () => {
  const owner = await env.install();
  const v = env.newClient();
  const slot = slotIn(4); // dentro das 12 h de prazo
  const b = await v.store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  await rejectsWith(v.store.cancelBooking(b.token, 'customer'), 'too_late');
  const far = slotIn(70);
  await rejectsWith(v.store.rescheduleBooking(b.token, { day: far.day, start: far.start }, 'customer'), 'too_late');
  const done = await owner.store.cancelBooking(b.token, 'owner');
  assert.equal(done.status, 'cancelled');
  assert.equal(done.endedBy, 'owner');
});

test('painel: lista do dia, concluído e não compareceu', async () => {
  const owner = await env.install();
  const slot = slotIn(40);
  const b = await env.newClient().store.createBooking({ serviceId: 'mao', day: slot.day, start: slot.start, customer: customer(1) });
  const list = await owner.store.listBookings({ fromDay: slot.day, toDay: slot.day });
  assert.deepEqual(list.map((x) => x.token), [b.token]);
  await rejectsWith(owner.store.finishBooking(b.token, 'done'), 'not_allowed'); // ainda não começou
  // um atendimento que já começou (reserva manual no passado recente)
  const past = slotIn(-1);
  const walkIn = await owner.store.createBooking({ serviceId: 'mao', day: past.day, start: past.start, customer: customer(2), source: 'manual' });
  assert.equal((await owner.store.finishBooking(walkIn.token, 'noshow')).status, 'noshow');
  assert.equal((await owner.store.reopenBooking(walkIn.token)).status, 'confirmed');
  assert.equal((await owner.store.finishBooking(walkIn.token, 'done')).status, 'done');
});

test('mudar o expediente rematerializa os dias sem apagar reservas', async () => {
  const owner = await env.install();
  const day = env.dayAhead(5);
  const b = await env.newClient().store.createBooking({ serviceId: 'mao', day, start: 120, customer: customer(1) });
  const s = (await owner.store.loadBusiness()).settings;
  const periods = [{ s: 14 * 60, e: 18 * 60 }];
  await owner.store.saveSettings({ ...s, exceptions: { [day]: { periods } } });
  const res = await owner.store.syncDays();
  assert.ok(res.updated >= 1);
  const d = await dayOf(owner.store, day);
  assert.equal(d.off[120], true);
  assert.equal(d.busy[120], true); // a reserva existente continua lá
  assert.equal((await owner.store.getBooking(b.token)).status, 'confirmed');
  await rejectsWith(env.newClient().store.createBooking({ serviceId: 'mao', day, start: 132, customer: customer(2) }), 'slot_taken');
});

test('dias além da janela ficam materializados com margem; sincronizar de novo não refaz nada', async () => {
  const owner = await env.install();
  const res = await owner.store.syncDays();
  assert.equal(res.created, 0);
  assert.equal(res.updated, 0);
  const days = await owner.store.loadDays(env.today(), addDays(env.today(), 90));
  assert.equal(Object.keys(days).length, 61);
});
