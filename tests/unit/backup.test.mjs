import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, planImport, BackupError, BACKUP_FORMAT } from '../../public/js/core/backup.js';
import { planCreate, planCancel, planEditCustomer, BookingError } from '../../public/js/core/booking.js';
import { buildDay } from '../../public/js/core/schedule.js';
import { settings, svc, MONDAY, NOW, at } from './_fixtures.mjs';

const HOUR = 3600000;
const dayDoc = () => ({ day: MONDAY, busy: {}, holds: {}, ...buildDay(settings(), MONDAY, []) });
const make = (n, over = {}) => planCreate({
  dayDoc: dayDoc(), settings: over.settings || settings(), service: svc(), start: over.start ?? at(10),
  customer: { name: `Cliente Fictícia ${n}`, phone: '92991234567' }, source: 'public', nowMs: over.nowMs ?? NOW,
  token: `t${n}`.padEnd(43, 'x'), bid: `b${n}`.padEnd(20, 'x'),
}).booking;

function sample() {
  const confirmed = make(1);
  const cancelled = planCancel({ booking: make(2, { start: at(14) }), actor: 'customer', nowMs: NOW }).booking;
  const pending = make(3, { start: at(16), settings: settings({ rules: { mode: 'approval' } }) });
  return {
    settings: settings(), services: [svc(), svc({ id: 'pe', name: 'Pé' })],
    blocks: [{ id: 'blk1', day: MONDAY, s: 600, e: 660, allDay: false, note: 'fictício' }],
    bookings: [confirmed, cancelled, pending],
  };
}

test('exportação tem formato, versão e datas legíveis', () => {
  const out = buildExport({ ...sample(), nowMs: NOW });
  assert.equal(out.format, BACKUP_FORMAT);
  assert.equal(out.version, 1);
  assert.equal(out.exportedAt, '2026-11-14T12:00:00.000Z');
  assert.equal(out.bookings.length, 3);
  assert.equal(out.bookings[0].startAt, '2026-11-16T14:00:00.000Z');
  assert.equal(out.bookings[0].customer.name, 'Cliente Fictícia 1');
  assert.equal(out.services.length, 2);
  assert.doesNotThrow(() => JSON.stringify(out));
});

test('importar em uma instalação vazia recupera tudo, separando histórico de reservas ativas', () => {
  const out = JSON.parse(JSON.stringify(buildExport({ ...sample(), nowMs: NOW })));
  const plan = planImport(out, { existingTokens: new Set(), nowMs: NOW });
  assert.deepEqual(plan.settings, sample().settings);
  assert.deepEqual(plan.services, sample().services);
  assert.deepEqual(plan.blocks, sample().blocks);
  assert.deepEqual(plan.active.map((b) => b.status), ['confirmed', 'pending']);
  assert.deepEqual(plan.history.map((b) => b.status), ['cancelled']);
  assert.equal(plan.active[0].startAt, sample().bookings[0].startAt);
  assert.equal(plan.active[0].createdAt, NOW);
  assert.equal(plan.skipped, 0);
});

test('importar duas vezes não duplica: reservas que já existem são puladas', () => {
  const out = buildExport({ ...sample(), nowMs: NOW });
  const existing = new Set(out.bookings.map((b) => b.token));
  const plan = planImport(out, { existingTokens: existing, nowMs: NOW });
  assert.equal(plan.active.length + plan.history.length, 0);
  assert.equal(plan.skipped, 3);
});

test('reserva confirmada que já passou e solicitação vencida entram como histórico', () => {
  const out = buildExport({ ...sample(), nowMs: NOW });
  const later = NOW + 30 * 24 * HOUR;
  const plan = planImport(out, { existingTokens: new Set(), nowMs: later });
  assert.equal(plan.active.length, 0);
  assert.deepEqual(plan.history.map((b) => b.status).sort(), ['cancelled', 'confirmed', 'expired']);
});

test('arquivo de outro formato, de versão futura ou corrompido é recusado', () => {
  const code = (data) => { try { planImport(data, { existingTokens: new Set(), nowMs: NOW }); } catch (e) { assert.ok(e instanceof BackupError); return e.code; } return null; };
  assert.equal(code({ foo: 1 }), 'invalid_format');
  assert.equal(code(null), 'invalid_format');
  assert.equal(code({ format: BACKUP_FORMAT, version: 99, bookings: [] }), 'unsupported_version');
  assert.equal(code({ format: BACKUP_FORMAT, version: 1, bookings: 'x' }), 'invalid_format');
});

test('reservas malformadas dentro do arquivo são puladas sem derrubar a importação', () => {
  const out = buildExport({ ...sample(), nowMs: NOW });
  out.bookings.push({ token: 'curto' }, { ...out.bookings[0], token: 'z'.repeat(43), day: 'ontem' });
  const plan = planImport(out, { existingTokens: new Set(), nowMs: NOW });
  assert.equal(plan.active.length + plan.history.length, 3);
  assert.equal(plan.skipped, 2);
});

test('a proprietária pode corrigir nome e telefone da cliente sem mexer na agenda', () => {
  const b = make(1);
  const plan = planEditCustomer({ booking: b, customer: { name: ' Maria  Souza ', phone: '(92) 98888-7777' }, nowMs: NOW + 1 });
  assert.deepEqual(plan.booking.customer, { name: 'Maria Souza', phone: '92988887777' });
  assert.equal(plan.booking.rev, 2);
  assert.equal(plan.booking.status, 'confirmed');
  assert.deepEqual(plan.dayOps, []);
  assert.throws(() => planEditCustomer({ booking: b, customer: { name: 'M', phone: '1' }, nowMs: NOW }), BookingError);
});
