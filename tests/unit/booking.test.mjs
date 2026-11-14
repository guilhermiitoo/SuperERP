import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planCreate, planCancel, planDecline, planApprove, planReschedule, planFinish, planReopen, planExpire,
  planReleaseHold, effectiveStatus, expiresAtMs, canCustomerCancel, canCustomerReschedule, BookingError,
} from '../../public/js/core/booking.js';
import { buildDay } from '../../public/js/core/schedule.js';
import { instantOf } from '../../public/js/core/time.js';
import { settings, svc, MONDAY, NOW, MANAUS, at } from './_fixtures.mjs';

const TUESDAY = 20261117;
const HOUR = 3600000;
const newDay = (s = settings(), day = MONDAY) => ({ day, busy: {}, holds: {}, ...buildDay(s, day, []) });
const customer = { name: 'Maria Souza', phone: '(92) 99123-4567' };
const ids = (n = 1) => ({ token: `tok${n}`.padEnd(43, 'x'), bid: `bid${n}`.padEnd(20, 'x') });
const range = (start, n) => Array.from({ length: n }, (_, i) => start + i);

/** Aplica as operações de dia como o banco faria, para encadear cenários. */
function apply(days, plan) {
  for (const op of plan.dayOps) {
    const d = days[op.day];
    for (const k of op.remove) { assert.ok(d.busy[k], `átomo ${k} deveria estar ocupado`); delete d.busy[k]; }
    for (const k of op.add) { assert.ok(!d.busy[k] && !d.off[k], `átomo ${k} deveria estar livre`); d.busy[k] = true; }
    if (op.holdDel) delete d.holds[op.holdDel];
    if (op.holdSet) d.holds[op.holdSet.bid] = op.holdSet.hold;
  }
  return plan.booking;
}

function create(days, over = {}) {
  const s = over.settings || settings();
  const day = over.day || MONDAY;
  const plan = planCreate({
    dayDoc: days[day], settings: s, service: over.service || svc(), start: over.start ?? at(10),
    customer: over.customer || customer, source: over.source || 'public', nowMs: over.nowMs ?? NOW, ...ids(over.n || 1),
  });
  return { plan, booking: apply(days, plan) };
}

const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof BookingError, String(e)); return e.code; } return null; };

test('modo automático: reserva válida nasce confirmada e ocupa duração + intervalo', () => {
  const days = { [MONDAY]: newDay() };
  const { plan, booking } = create(days);
  assert.equal(booking.status, 'confirmed');
  assert.equal(booking.mode, 'auto');
  assert.equal(booking.rev, 1);
  assert.equal(booking.day, MONDAY);
  assert.equal(booking.start, at(10));
  assert.equal(booking.n, 11);
  assert.equal(booking.startAt, instantOf(MONDAY, 600, MANAUS));
  assert.equal(booking.createdAt, NOW);
  assert.equal(booking.pendingSince, null);
  assert.deepEqual(plan.dayOps, [{ day: MONDAY, add: range(at(10), 11), remove: [], holdSet: null, holdDel: null, op: { bid: booking.bid, rev: 1 } }]);
});

test('a reserva guarda uma cópia do serviço e os dados normalizados da cliente', () => {
  const days = { [MONDAY]: newDay() };
  const service = svc({ price: 3500 });
  const { booking } = create(days, { service, customer: { name: '  Maria   Souza ', phone: '+55 (92) 99123-4567' } });
  service.price = 9900; service.name = 'Outro';
  assert.deepEqual(booking.service, { id: 'mao', name: 'Mão', price: 3500, duration: 45, buffer: 10 });
  assert.deepEqual(booking.customer, { name: 'Maria Souza', phone: '92991234567' });
});

test('a reserva guarda o prazo de cancelamento vigente na criação', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days, { settings: settings({ rules: { cancelLimitMin: 180 } }) });
  assert.equal(booking.cancelLimitMin, 180);
});

test('modo aprovação: nasce pendente, com retenção do horário e prazo', () => {
  const days = { [MONDAY]: newDay() };
  const s = settings({ rules: { mode: 'approval', approvalMin: 720 } });
  const { plan, booking } = create(days, { settings: s });
  assert.equal(booking.status, 'pending');
  assert.equal(booking.mode, 'approval');
  assert.equal(booking.approvalMin, 720);
  assert.equal(booking.pendingSince, NOW);
  assert.deepEqual(plan.dayOps[0].holdSet, { bid: booking.bid, hold: { s: at(10), n: 11, c: NOW, a: 720 } });
  assert.equal(expiresAtMs(booking), NOW + 12 * HOUR);
  assert.equal(effectiveStatus(booking, NOW + 11 * HOUR), 'pending');
  assert.equal(effectiveStatus(booking, NOW + 13 * HOUR), 'expired');
});

test('o prazo de aprovação nunca passa de 1 hora antes do início', () => {
  const days = { [MONDAY]: newDay() };
  const s = settings({ rules: { mode: 'approval', approvalMin: 720 } });
  const nowMs = instantOf(MONDAY, 7 * 60, MANAUS); // 3 h antes
  const { booking } = create(days, { settings: s, nowMs });
  assert.equal(expiresAtMs(booking), booking.startAt - HOUR);
});

test('reserva manual da proprietária é sempre confirmada, mesmo no modo aprovação, e ignora antecedência e pausa', () => {
  const days = { [MONDAY]: newDay() };
  const s = settings({ rules: { mode: 'approval', paused: true } });
  const nowMs = instantOf(MONDAY, 9 * 60 + 50, MANAUS);
  const { booking } = create(days, { settings: s, source: 'manual', nowMs });
  assert.equal(booking.status, 'confirmed');
  assert.equal(booking.source, 'manual');
  assert.equal(booking.mode, 'auto');
});

test('recusa horário ocupado, fechado, cedo demais, longe demais e agenda pausada', () => {
  const days = { [MONDAY]: newDay(), [20261221]: newDay(settings(), 20261221) };
  create(days);
  assert.equal(code(() => create(days, { n: 2, start: at(10, 30) })), 'slot_taken');
  assert.equal(code(() => create(days, { n: 2, start: at(12) })), 'slot_taken');
  assert.equal(code(() => create(days, { n: 2, start: at(13), nowMs: instantOf(MONDAY, 12 * 60, MANAUS) })), 'too_soon');
  assert.equal(code(() => create(days, { n: 2, day: 20261221, start: at(13) })), 'too_far');
  assert.equal(code(() => create(days, { n: 2, start: at(13), settings: settings({ rules: { paused: true } }) })), 'paused');
});

test('recusa nome ou telefone inválidos e serviço inativo', () => {
  const days = { [MONDAY]: newDay() };
  assert.equal(code(() => create(days, { customer: { name: 'A', phone: '92991234567' } })), 'invalid_name');
  assert.equal(code(() => create(days, { customer: { name: 'Maria', phone: '123' } })), 'invalid_phone');
  assert.equal(code(() => create(days, { service: svc({ active: false }) })), 'service_unavailable');
  assert.deepEqual(days[MONDAY].busy, {});
});

test('cancelar libera exatamente os átomos da reserva', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days);
  const plan = planCancel({ booking, dayDoc: days[MONDAY], actor: 'customer', nowMs: NOW });
  const after = apply(days, plan);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.endedBy, 'customer');
  assert.equal(after.rev, 2);
  assert.deepEqual(plan.dayOps[0].remove, range(at(10), 11));
  assert.deepEqual(days[MONDAY].busy, {});
  assert.equal(code(() => create(days, { n: 2 })), null); // o horário voltou a ficar livre
});

test('a cliente só cancela ou remarca até o prazo; a proprietária cancela a qualquer momento', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days);
  const late = booking.startAt - 11 * HOUR;
  assert.equal(canCustomerCancel(booking, late), false);
  assert.equal(canCustomerReschedule(booking, late), false);
  assert.equal(canCustomerCancel(booking, booking.startAt - 13 * HOUR), true);
  assert.equal(code(() => planCancel({ booking, dayDoc: days[MONDAY], actor: 'customer', nowMs: late })), 'too_late');
  assert.equal(planCancel({ booking, dayDoc: days[MONDAY], actor: 'owner', nowMs: late }).booking.endedBy, 'owner');
});

test('solicitação pendente pode ser cancelada pela cliente mesmo dentro do prazo, até o início', () => {
  const days = { [MONDAY]: newDay() };
  const s = settings({ rules: { mode: 'approval' } });
  const nowMs = instantOf(MONDAY, 7 * 60, MANAUS);
  const { booking } = create(days, { settings: s, nowMs });
  assert.equal(canCustomerCancel(booking, nowMs + 60000), true);
  const plan = planCancel({ booking, dayDoc: days[MONDAY], actor: 'customer', nowMs: nowMs + 60000 });
  assert.equal(plan.dayOps[0].holdDel, booking.bid);
  apply(days, plan);
  assert.deepEqual(days[MONDAY].holds, {});
});

test('não é possível cancelar duas vezes', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days);
  const cancelled = apply(days, planCancel({ booking, dayDoc: days[MONDAY], actor: 'owner', nowMs: NOW }));
  assert.equal(code(() => planCancel({ booking: cancelled, dayDoc: days[MONDAY], actor: 'owner', nowMs: NOW })), 'not_allowed');
});

test('aprovar confirma e remove a retenção sem mexer nos átomos', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days, { settings: settings({ rules: { mode: 'approval' } }) });
  const plan = planApprove({ booking, dayDoc: days[MONDAY], nowMs: NOW + HOUR });
  const after = apply(days, plan);
  assert.equal(after.status, 'confirmed');
  assert.equal(after.pendingSince, null);
  assert.deepEqual(plan.dayOps, [{ day: MONDAY, add: [], remove: [], holdSet: null, holdDel: booking.bid, op: { bid: booking.bid, rev: 2 } }]);
  assert.equal(Object.keys(days[MONDAY].busy).length, 11);
});

test('não é possível aprovar depois do prazo', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days, { settings: settings({ rules: { mode: 'approval' } }) });
  assert.equal(code(() => planApprove({ booking, dayDoc: days[MONDAY], nowMs: NOW + 13 * HOUR })), 'expired');
});

test('recusar libera o horário', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days, { settings: settings({ rules: { mode: 'approval' } }) });
  const after = apply(days, planDecline({ booking, dayDoc: days[MONDAY], nowMs: NOW + HOUR }));
  assert.equal(after.status, 'declined');
  assert.deepEqual(days[MONDAY].busy, {});
  assert.deepEqual(days[MONDAY].holds, {});
});

test('expiração: qualquer pessoa libera a retenção vencida; depois o painel grava o estado', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days, { settings: settings({ rules: { mode: 'approval' } }) });
  const later = NOW + 13 * HOUR;
  assert.equal(code(() => planReleaseHold({ dayDoc: days[MONDAY], bid: booking.bid, nowMs: NOW + HOUR, offsetMin: MANAUS })), 'not_allowed');
  const release = planReleaseHold({ dayDoc: days[MONDAY], bid: booking.bid, nowMs: later, offsetMin: MANAUS });
  assert.equal(release.booking, null);
  apply(days, release);
  assert.deepEqual(days[MONDAY].busy, {});
  assert.deepEqual(days[MONDAY].holds, {});
  // o painel grava "expirado" sem tentar liberar de novo
  const plan = planExpire({ booking, dayDoc: days[MONDAY], nowMs: later });
  assert.equal(plan.booking.status, 'expired');
  assert.deepEqual(plan.dayOps[0].remove, []);
});

test('expiração gravada pelo painel libera o horário quando ninguém liberou antes', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days, { settings: settings({ rules: { mode: 'approval' } }) });
  assert.equal(code(() => planExpire({ booking, dayDoc: days[MONDAY], nowMs: NOW + HOUR })), 'not_allowed');
  const after = apply(days, planExpire({ booking, dayDoc: days[MONDAY], nowMs: NOW + 13 * HOUR }));
  assert.equal(after.status, 'expired');
  assert.deepEqual(days[MONDAY].busy, {});
});

test('remarcar no mesmo dia troca só a diferença de átomos, em uma única operação', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days); // 10:00–10:55
  const plan = planReschedule({ booking, fromDay: days[MONDAY], toDay: days[MONDAY], start: at(10, 30), actor: 'customer', settings: settings(), nowMs: NOW });
  assert.equal(plan.dayOps.length, 1);
  assert.deepEqual(plan.dayOps[0].remove, range(at(10), 6));
  assert.deepEqual(plan.dayOps[0].add, range(at(10, 55), 6));
  const after = apply(days, plan);
  assert.equal(after.start, at(10, 30));
  assert.equal(after.startAt, instantOf(MONDAY, 630, MANAUS));
  assert.equal(after.status, 'confirmed');
  assert.equal(after.rev, 2);
  assert.deepEqual(Object.keys(days[MONDAY].busy).map(Number), range(at(10, 30), 11));
});

test('remarcar para outro dia ocupa o novo e libera o antigo no mesmo plano', () => {
  const days = { [MONDAY]: newDay(), [TUESDAY]: newDay(settings(), TUESDAY) };
  const { booking } = create(days);
  const plan = planReschedule({ booking, fromDay: days[MONDAY], toDay: days[TUESDAY], start: at(15), actor: 'customer', settings: settings(), nowMs: NOW });
  assert.deepEqual(plan.dayOps.map((o) => o.day), [TUESDAY, MONDAY]); // garante o novo antes de liberar o antigo
  const after = apply(days, plan);
  assert.equal(after.day, TUESDAY);
  assert.deepEqual(days[MONDAY].busy, {});
  assert.equal(Object.keys(days[TUESDAY].busy).length, 11);
});

test('remarcação recusada não altera nada: o horário original continua da cliente', () => {
  const days = { [MONDAY]: newDay(), [TUESDAY]: newDay(settings(), TUESDAY) };
  const { booking } = create(days);
  create(days, { n: 2, day: TUESDAY, start: at(15) });
  const before = JSON.stringify(days);
  assert.equal(code(() => planReschedule({ booking, fromDay: days[MONDAY], toDay: days[TUESDAY], start: at(15, 30), actor: 'customer', settings: settings(), nowMs: NOW })), 'slot_taken');
  assert.equal(JSON.stringify(days), before);
});

test('remarcação pela cliente respeita prazo, antecedência e janela; a proprietária não', () => {
  const days = { [MONDAY]: newDay(), [TUESDAY]: newDay(settings(), TUESDAY) };
  const { booking } = create(days);
  const late = booking.startAt - HOUR;
  const args = { booking, fromDay: days[MONDAY], toDay: days[TUESDAY], start: at(15), settings: settings() };
  assert.equal(code(() => planReschedule({ ...args, actor: 'customer', nowMs: late })), 'too_late');
  assert.equal(planReschedule({ ...args, actor: 'owner', nowMs: late }).booking.day, TUESDAY);
  const soon = { ...args, toDay: days[MONDAY], start: at(13) };
  assert.equal(code(() => planReschedule({ ...soon, actor: 'customer', nowMs: instantOf(MONDAY, 600, MANAUS) - 13 * HOUR + 0 })), null);
});

test('no modo aprovação, remarcar pela cliente volta a ficar pendente; pela proprietária fica confirmado', () => {
  const s = settings({ rules: { mode: 'approval' } });
  const days = { [MONDAY]: newDay(s), [TUESDAY]: newDay(s, TUESDAY) };
  const created = create(days, { settings: s });
  const confirmed = apply(days, planApprove({ booking: created.booking, dayDoc: days[MONDAY], nowMs: NOW }));
  const later = NOW + HOUR;
  const byCustomer = planReschedule({ booking: confirmed, fromDay: days[MONDAY], toDay: days[TUESDAY], start: at(15), actor: 'customer', settings: s, nowMs: later });
  assert.equal(byCustomer.booking.status, 'pending');
  assert.equal(byCustomer.booking.pendingSince, later);
  assert.deepEqual(byCustomer.dayOps[0].holdSet, { bid: confirmed.bid, hold: { s: at(15), n: 11, c: later, a: 720 } });
  const byOwner = planReschedule({ booking: confirmed, fromDay: days[MONDAY], toDay: days[TUESDAY], start: at(15), actor: 'owner', settings: s, nowMs: later });
  assert.equal(byOwner.booking.status, 'confirmed');
  assert.equal(byOwner.dayOps[0].holdSet, null);
});

test('mudar o modo de confirmação só afeta reservas novas', () => {
  const auto = settings();
  const approval = settings({ rules: { mode: 'approval' } });
  const days = { [MONDAY]: newDay(), [TUESDAY]: newDay(auto, TUESDAY) };
  const { booking } = create(days, { settings: auto });
  const moved = planReschedule({ booking, fromDay: days[MONDAY], toDay: days[TUESDAY], start: at(15), actor: 'customer', settings: approval, nowMs: NOW });
  assert.equal(moved.booking.status, 'confirmed');
  assert.equal(moved.booking.mode, 'auto');
});

test('concluído e não compareceu só depois do início, e podem ser desfeitos', () => {
  const days = { [MONDAY]: newDay() };
  const { booking } = create(days);
  assert.equal(code(() => planFinish({ booking, outcome: 'done', nowMs: booking.startAt - 1 })), 'not_allowed');
  const done = planFinish({ booking, outcome: 'done', nowMs: booking.startAt + 1 });
  assert.equal(done.booking.status, 'done');
  assert.deepEqual(done.dayOps, []);
  assert.equal(planFinish({ booking, outcome: 'noshow', nowMs: booking.startAt + 1 }).booking.status, 'noshow');
  const reopened = planReopen({ booking: done.booking, nowMs: booking.startAt + 2 });
  assert.equal(reopened.booking.status, 'confirmed');
  assert.equal(reopened.booking.rev, 3);
});

test('mudar o preço do serviço não altera reservas já criadas', () => {
  const days = { [MONDAY]: newDay() };
  const service = svc({ price: 3500, duration: 45 });
  const { booking } = create(days, { service });
  const changed = { ...service, price: 5000, duration: 60 };
  const second = create(days, { n: 2, service: changed, start: at(14) }).booking;
  assert.equal(booking.service.price, 3500);
  assert.equal(booking.service.duration, 45);
  assert.equal(second.service.price, 5000);
  assert.equal(second.n, 14);
});
