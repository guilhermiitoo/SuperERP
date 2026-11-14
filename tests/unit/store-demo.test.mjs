// Modo demonstração: mesma orquestração do modo Firebase, sobre um armazenamento local.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore, memoryStorage } from '../../public/js/data/demo.js';
import { seedDemo } from '../../public/js/data/demo-seed.js';
import { defaultSettings } from '../../public/js/core/settings.js';
import { instantOf, addDays, localOf } from '../../public/js/core/time.js';
import { todayOf } from '../../public/js/core/schedule.js';

const OFFSET = -240;
const HOUR = 3600000;
// "agora" controlável: segunda-feira 16/11/2026, 08:00 em Manaus
const T0 = instantOf(20261116, 8 * 60, OFFSET);
const svc = { id: 'mao', name: 'Mão', description: '', price: 3500, duration: 45, buffer: 10, active: true, order: 1 };
const cust = (n) => ({ name: `Cliente Fictícia ${n}`, phone: `9290000${String(1000 + n)}` });
const code = async (p) => { try { await p; } catch (e) { return e.code; } return null; };

async function setup(rules = {}) {
  let nowMs = T0;
  const storage = memoryStorage();
  const store = createDemoStore({ storage, now: () => nowMs });
  await store.signIn('demo', 'demo');
  const base = defaultSettings();
  await store.saveSettings({ ...base, business: { ...base.business, name: 'Studio Aurora (demonstração)' }, rules: { ...base.rules, ...rules } });
  await store.saveService(svc);
  await store.syncDays();
  return { store, storage, advance: (ms) => { nowMs += ms; }, now: () => nowMs };
}

test('demonstração: reserva confirmada, leitura pelo link e ocupação do dia', async () => {
  const { store } = await setup();
  const b = await store.createBooking({ serviceId: 'mao', day: 20261117, start: 120, customer: cust(1) });
  assert.equal(b.status, 'confirmed');
  assert.equal((await store.getBooking(b.token)).customer.name, 'Cliente Fictícia 1');
  const d = (await store.loadDays(20261117, 20261117))[20261117];
  assert.equal(Object.keys(d.busy).length, 11);
  assert.equal(await store.getBooking('nao-existe'), null);
});

test('demonstração: o segundo pedido para o mesmo horário é recusado', async () => {
  const { store } = await setup();
  const results = await Promise.allSettled([1, 2, 3].map((n) => store.createBooking({ serviceId: 'mao', day: 20261117, start: 120, customer: cust(n) })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.deepEqual(results.filter((r) => r.status === 'rejected').map((r) => r.reason.code), ['slot_taken', 'slot_taken']);
});

test('demonstração: cancelar libera; remarcar é atômico', async () => {
  const { store } = await setup();
  const a = await store.createBooking({ serviceId: 'mao', day: 20261117, start: 120, customer: cust(1) });
  const b = await store.createBooking({ serviceId: 'mao', day: 20261118, start: 120, customer: cust(2) });
  assert.equal(await code(store.rescheduleBooking(a.token, { day: 20261118, start: 126 }, 'customer')), 'slot_taken');
  assert.equal((await store.getBooking(a.token)).day, 20261117);
  await store.cancelBooking(b.token, 'customer');
  const moved = await store.rescheduleBooking(a.token, { day: 20261118, start: 126 }, 'customer');
  assert.equal(moved.day, 20261118);
  const days = await store.loadDays(20261117, 20261118);
  assert.deepEqual(days[20261117].busy, {});
  assert.equal(Object.keys(days[20261118].busy).length, 11);
});

test('demonstração: aprovação, expiração com o relógio e liberação do horário', async () => {
  const { store, advance } = await setup({ mode: 'approval', approvalMin: 120 });
  const a = await store.createBooking({ serviceId: 'mao', day: 20261118, start: 120, customer: cust(1) });
  assert.equal(a.status, 'pending');
  assert.equal((await store.listPending()).length, 1);
  advance(3 * HOUR);
  assert.equal((await store.getBooking(a.token)).effectiveStatus, 'expired');
  assert.equal(await code(store.approveBooking(a.token)), 'expired');
  assert.equal((await store.listPending()).length, 0);
  const b = await store.createBooking({ serviceId: 'mao', day: 20261118, start: 120, customer: cust(2) });
  assert.equal(b.status, 'pending');
  assert.equal((await store.sweepExpired()).expired, 1);
  assert.equal((await store.getBooking(a.token)).status, 'expired');
  assert.equal((await store.approveBooking(b.token)).status, 'confirmed');
});

test('demonstração: sem sessão não há acesso ao painel', async () => {
  const { store } = await setup();
  await store.signOut();
  assert.equal(await store.isOwner(), false);
  assert.equal(await code(store.listBookings({ fromDay: 20261116, toDay: 20261120 })), 'permission-denied');
  assert.equal(await code(store.saveService({ ...svc, price: 1 })), 'permission-denied');
  assert.equal((await store.loadBusiness()).services[0].price, 3500);
});

test('exportação e recuperação: instalação nova recebe tudo, sem duplicar ao importar de novo', async () => {
  const a = await setup({ mode: 'approval', approvalMin: 720 });
  await a.store.saveBlock({ day: 20261120, s: 600, e: 660, allDay: false, note: 'fictício' });
  const confirmed = await a.store.createBooking({ serviceId: 'mao', day: 20261117, start: 120, customer: cust(1), source: 'manual' });
  const pending = await a.store.createBooking({ serviceId: 'mao', day: 20261118, start: 120, customer: cust(2) });
  const cancelled = await a.store.createBooking({ serviceId: 'mao', day: 20261119, start: 120, customer: cust(3), source: 'manual' });
  await a.store.cancelBooking(cancelled.token, 'owner');
  const file = JSON.parse(JSON.stringify(await a.store.exportAll()));
  assert.equal(file.bookings.length, 3);

  const b = await setup(); // outra instalação, vazia
  const report = await b.store.importAll(file, { replaceSettings: true });
  assert.deepEqual({ ...report, conflicts: report.conflicts.length }, { settings: true, services: 1, blocks: 1, history: 1, active: 2, skipped: 0, conflicts: 0 });
  assert.equal((await b.store.loadBusiness()).settings.rules.mode, 'approval');
  // os links das clientes continuam funcionando e a agenda volta a ficar ocupada
  assert.equal((await b.store.getBooking(confirmed.token)).status, 'confirmed');
  assert.equal((await b.store.getBooking(pending.token)).status, 'pending');
  assert.equal((await b.store.getBooking(cancelled.token)).status, 'cancelled');
  const days = await b.store.loadDays(20261117, 20261120);
  assert.equal(Object.keys(days[20261117].busy).length, 11);
  assert.equal(Object.keys(days[20261118].holds).length, 1);
  assert.deepEqual(days[20261119].busy, {});
  assert.equal(days[20261120].off[120], true); // bloqueio restaurado
  assert.equal(await code(b.store.createBooking({ serviceId: 'mao', day: 20261117, start: 120, customer: cust(9) })), 'slot_taken');

  const again = await b.store.importAll(file);
  assert.equal(again.active + again.history, 0);
  assert.equal(again.skipped, 3);
  assert.equal((await b.store.listBookings({ fromDay: 20261116, toDay: 20261130 })).length, 3);
});

test('recuperação: reserva do arquivo que conflita com a agenda atual é relatada, não sobrescreve', async () => {
  const a = await setup();
  const mine = await a.store.createBooking({ serviceId: 'mao', day: 20261117, start: 120, customer: cust(1) });
  const file = await a.store.exportAll();
  const b = await setup();
  const local = await b.store.createBooking({ serviceId: 'mao', day: 20261117, start: 122, customer: cust(5) });
  const report = await b.store.importAll(file);
  assert.equal(report.active, 0);
  assert.equal(report.conflicts.length, 1);
  assert.equal(report.conflicts[0].token, mine.token);
  assert.equal((await b.store.getBooking(local.token)).status, 'confirmed');
  assert.equal(await b.store.getBooking(mine.token), null);
});

test('dados de demonstração: negócio fictício identificado, serviços e agenda do dia', async () => {
  let nowMs = T0;
  const store = createDemoStore({ storage: memoryStorage(), now: () => nowMs });
  await seedDemo(store);
  const { settings, services } = await store.loadBusiness();
  assert.match(settings.business.name, /demonstração/i);
  assert.match(settings.business.address, /fictício/i);
  assert.ok(services.length >= 5);
  assert.ok(services.some((s) => s.name === 'Mão + pé'));
  await store.signIn('demo', 'demo');
  const today = todayOf(nowMs, OFFSET);
  const list = await store.listBookings({ fromDay: today, toDay: addDays(today, 7) });
  assert.ok(list.length >= 4);
  assert.ok(list.some((b) => b.day === today));
  // semear de novo não duplica
  await seedDemo(store);
  assert.equal((await store.listBookings({ fromDay: today, toDay: addDays(today, 7) })).length, list.length);
  assert.equal(localOf(nowMs, OFFSET).day, today);
});
