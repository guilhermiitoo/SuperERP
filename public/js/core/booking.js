// Reservas: estados, permissões e planejamento das operações.
// Cada função plan* recebe o estado atual e devolve o que deve ser gravado: a reserva nova e as
// operações no(s) documento(s) de dia. Nada aqui grava; a camada de dados aplica o plano de forma
// atômica e as regras do Firestore conferem tudo de novo no servidor.

import { ATOM_MIN, daysBetween, instantOf } from './time.js';
import { claim, minAdvanceOf, todayOf } from './schedule.js';
import { normalizeName, normalizePhone } from './validate.js';
import { AGENDA_ID, APPROVAL_MARGIN_MIN } from './constants.js';

export const STATUS = Object.freeze({
  PENDING: 'pending', CONFIRMED: 'confirmed', DONE: 'done', CANCELLED: 'cancelled',
  DECLINED: 'declined', EXPIRED: 'expired', NOSHOW: 'noshow',
});

export class BookingError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'BookingError';
    this.code = code;
  }
}

const fail = (code) => { throw new BookingError(code); };
const range = (start, n) => Array.from({ length: n }, (_, i) => start + i);
const noDayChange = { add: [], remove: [], holdSet: null, holdDel: null };

/** Momento em que uma solicitação pendente vence; null se não estiver pendente. */
export function expiresAtMs(b) {
  if (b.status !== STATUS.PENDING) return null;
  return Math.min(b.pendingSince + b.approvalMin * 60000, b.startAt - APPROVAL_MARGIN_MIN * 60000);
}

/** Estado considerando o relógio: pendente vencida conta como expirada mesmo antes de ser gravada. */
export function effectiveStatus(b, nowMs) {
  return b.status === STATUS.PENDING && nowMs > expiresAtMs(b) ? STATUS.EXPIRED : b.status;
}

export function isActive(b, nowMs) {
  const s = effectiveStatus(b, nowMs);
  return s === STATUS.PENDING || s === STATUS.CONFIRMED;
}

const cancelDeadline = (b) => b.startAt - b.cancelLimitMin * 60000;

export function canCustomerCancel(b, nowMs) {
  const s = effectiveStatus(b, nowMs);
  if (s === STATUS.PENDING) return nowMs < b.startAt;
  return s === STATUS.CONFIRMED && nowMs <= cancelDeadline(b);
}

export function canCustomerReschedule(b, nowMs) {
  return isActive(b, nowMs) && nowMs <= cancelDeadline(b);
}

/** Antecedência mínima e janela máxima para quem reserva pelo link. */
function checkPublicTime(day, start, settings, nowMs) {
  const offset = settings.utcOffsetMin;
  const ahead = daysBetween(todayOf(nowMs, offset), day);
  if (ahead > settings.rules.maxDays) fail('too_far');
  if (instantOf(day, start * ATOM_MIN, offset) < nowMs + minAdvanceOf(settings.rules) * 60000) fail('too_soon');
}

function touch(b, nowMs, changes) {
  return { ...b, ...changes, rev: b.rev + 1, updatedAt: nowMs };
}

function requireStored(b, ...statuses) {
  if (!statuses.includes(b.status)) fail('not_allowed');
}

function requireNotExpired(b, nowMs) {
  if (effectiveStatus(b, nowMs) === STATUS.EXPIRED) fail('expired');
}

/**
 * Nova reserva.
 * @param p {{dayDoc, settings, service, start:number, customer:{name,phone}, source:'public'|'manual',
 *            nowMs:number, token:string, bid:string}}
 */
export function planCreate(p) {
  const { dayDoc, settings, service, start, source, nowMs, token, bid } = p;
  const isPublic = source !== 'manual';
  if (isPublic && settings.rules.paused) fail('paused');
  if (!service || service.active === false) fail('service_unavailable');
  const name = normalizeName(p.customer?.name);
  if (!name) fail('invalid_name');
  const phone = normalizePhone(p.customer?.phone);
  if (!phone) fail('invalid_phone');
  if (!dayDoc) fail('slot_taken');
  if (isPublic) checkPublicTime(dayDoc.day, start, settings, nowMs);
  const n = claim(dayDoc, start, service);
  if (!n) fail('slot_taken');

  const pending = isPublic && settings.rules.mode === 'approval';
  const booking = {
    token, bid, rev: 1, agenda: AGENDA_ID,
    status: pending ? STATUS.PENDING : STATUS.CONFIRMED,
    source: isPublic ? 'public' : 'manual',
    mode: pending ? 'approval' : 'auto',
    day: dayDoc.day, start, n,
    startAt: instantOf(dayDoc.day, start * ATOM_MIN, settings.utcOffsetMin),
    service: { id: service.id, name: service.name, price: service.price, duration: service.duration, buffer: service.buffer || 0 },
    customer: { name, phone },
    approvalMin: pending ? settings.rules.approvalMin : 0,
    cancelLimitMin: settings.rules.cancelLimitMin,
    createdAt: nowMs, updatedAt: nowMs,
    pendingSince: pending ? nowMs : null,
    endedBy: null,
  };
  const hold = pending ? { bid, hold: { s: start, n, c: nowMs, a: booking.approvalMin } } : null;
  return {
    booking,
    dayOps: [{ day: dayDoc.day, add: range(start, n), remove: [], holdSet: hold, holdDel: null, op: { bid, rev: 1 } }],
  };
}

function release(b, nowMs, changes) {
  const booking = touch(b, nowMs, { ...changes, pendingSince: null });
  const op = { bid: b.bid, rev: booking.rev };
  return {
    booking,
    dayOps: [{ day: b.day, add: [], remove: range(b.start, b.n), holdSet: null, holdDel: b.status === STATUS.PENDING ? b.bid : null, op }],
  };
}

/** Cancelamento pela cliente (dentro do prazo) ou pela proprietária (sempre). */
export function planCancel({ booking: b, actor, nowMs }) {
  requireStored(b, STATUS.PENDING, STATUS.CONFIRMED);
  requireNotExpired(b, nowMs);
  if (actor === 'customer' && !canCustomerCancel(b, nowMs)) fail('too_late');
  return release(b, nowMs, { status: STATUS.CANCELLED, endedBy: actor === 'owner' ? 'owner' : 'customer' });
}

/** Recusa de uma solicitação pendente pela proprietária. */
export function planDecline({ booking: b, nowMs }) {
  requireStored(b, STATUS.PENDING);
  requireNotExpired(b, nowMs);
  return release(b, nowMs, { status: STATUS.DECLINED, endedBy: 'owner' });
}

/** Aprovação: confirma e remove a retenção; os átomos continuam ocupados. */
export function planApprove({ booking: b, nowMs }) {
  requireStored(b, STATUS.PENDING);
  requireNotExpired(b, nowMs);
  const booking = touch(b, nowMs, { status: STATUS.CONFIRMED, pendingSince: null });
  return { booking, dayOps: [{ day: b.day, ...noDayChange, holdDel: b.bid, op: { bid: b.bid, rev: booking.rev } }] };
}

/** O painel grava "expirado". Libera o horário se ninguém liberou antes. */
export function planExpire({ booking: b, dayDoc, nowMs }) {
  requireStored(b, STATUS.PENDING);
  if (effectiveStatus(b, nowMs) !== STATUS.EXPIRED) fail('not_allowed');
  if (dayDoc?.holds?.[b.bid]) return release(b, nowMs, { status: STATUS.EXPIRED });
  const booking = touch(b, nowMs, { status: STATUS.EXPIRED, pendingSince: null });
  return { booking, dayOps: [{ day: b.day, ...noDayChange, op: { bid: b.bid, rev: booking.rev } }] };
}

/** Libera os átomos de uma retenção vencida. Qualquer pessoa pode; não altera a reserva. */
export function planReleaseHold({ dayDoc, bid, nowMs, offsetMin }) {
  const hold = dayDoc?.holds?.[bid];
  if (!hold) fail('not_allowed');
  const start = instantOf(dayDoc.day, hold.s * ATOM_MIN, offsetMin);
  const expires = Math.min(hold.c + hold.a * 60000, start - APPROVAL_MARGIN_MIN * 60000);
  if (nowMs <= expires) fail('not_allowed');
  return {
    booking: null,
    dayOps: [{ day: dayDoc.day, add: [], remove: range(hold.s, hold.n), holdSet: null, holdDel: bid, op: { bid, rev: 0 } }],
  };
}

/**
 * Remarcação. O plano ocupa o novo horário e libera o antigo na mesma gravação atômica.
 * @param p {{booking, fromDay, toDay, start:number, actor:'customer'|'owner', settings, nowMs:number}}
 */
export function planReschedule({ booking: b, fromDay, toDay, start, actor, settings, nowMs }) {
  requireStored(b, STATUS.PENDING, STATUS.CONFIRMED);
  requireNotExpired(b, nowMs);
  if (!toDay) fail('slot_taken');
  if (toDay.day === b.day && start === b.start) fail('not_allowed');
  if (actor === 'customer') {
    if (!canCustomerReschedule(b, nowMs)) fail('too_late');
    checkPublicTime(toDay.day, start, settings, nowMs);
  }
  const sameDay = toDay.day === b.day;
  const old = range(b.start, b.n);
  let target = toDay;
  if (sameDay) {
    const busy = { ...toDay.busy };
    for (const k of old) delete busy[k];
    target = { ...toDay, busy };
  }
  const n = claim(target, start, b.service);
  if (!n) fail('slot_taken');

  const pending = actor === 'customer' && b.mode === 'approval';
  const wasPending = b.status === STATUS.PENDING;
  const booking = touch(b, nowMs, {
    status: pending ? STATUS.PENDING : STATUS.CONFIRMED,
    day: toDay.day, start, n,
    startAt: instantOf(toDay.day, start * ATOM_MIN, settings.utcOffsetMin),
    pendingSince: pending ? nowMs : null,
  });
  const op = { bid: b.bid, rev: booking.rev };
  const fresh = range(start, n);
  const holdSet = pending ? { bid: b.bid, hold: { s: start, n, c: nowMs, a: b.approvalMin } } : null;
  const holdDel = wasPending && !pending ? b.bid : null;
  if (sameDay) {
    return {
      booking,
      dayOps: [{
        day: b.day,
        add: fresh.filter((k) => !old.includes(k)),
        remove: old.filter((k) => !fresh.includes(k)),
        holdSet, holdDel, op,
      }],
    };
  }
  return {
    booking,
    dayOps: [
      { day: toDay.day, add: fresh, remove: [], holdSet, holdDel: null, op },
      { day: fromDay.day, add: [], remove: old, holdSet: null, holdDel: wasPending ? b.bid : null, op },
    ],
  };
}

/** Concluído ou não compareceu. Só depois do início. Não mexe na agenda. */
export function planFinish({ booking: b, outcome, nowMs }) {
  requireStored(b, STATUS.CONFIRMED);
  if (nowMs < b.startAt) fail('not_allowed');
  if (outcome !== STATUS.DONE && outcome !== STATUS.NOSHOW) fail('not_allowed');
  return { booking: touch(b, nowMs, { status: outcome }), dayOps: [] };
}

/** Desfaz concluído/não compareceu marcado por engano. */
export function planReopen({ booking: b, nowMs }) {
  requireStored(b, STATUS.DONE, STATUS.NOSHOW);
  return { booking: touch(b, nowMs, { status: STATUS.CONFIRMED }), dayOps: [] };
}

/** Correção de nome/telefone pela proprietária. Não mexe na agenda. */
export function planEditCustomer({ booking: b, customer, nowMs }) {
  const name = normalizeName(customer?.name);
  if (!name) fail('invalid_name');
  const phone = normalizePhone(customer?.phone);
  if (!phone) fail('invalid_phone');
  return { booking: touch(b, nowMs, { customer: { name, phone } }), dayOps: [] };
}
