// Disponibilidade: transforma expediente, pausas, folgas e bloqueios em átomos indisponíveis
// e calcula quais inícios cabem em um dia. Sem DOM e sem rede.

import { ATOM_MIN, ATOMS_PER_DAY, addDays, daysBetween, fmtTime, instantOf, localOf, weekdayOf } from './time.js';
import { APPROVAL_MARGIN_MIN, APPROVAL_MIN_ADVANCE_MIN, MAX_CLAIM_ATOMS } from './constants.js';

const atomOf = (minutes) => Math.round(minutes / ATOM_MIN);

export function todayOf(nowMs, offsetMin) {
  return localOf(nowMs, offsetMin).day;
}

/** Períodos de atendimento de um dia, já considerando exceções por data. */
export function periodsOf(settings, day) {
  const ex = settings.exceptions?.[day];
  if (ex) return ex.closed ? [] : ex.periods || [];
  const wd = settings.week?.[weekdayOf(day)];
  return wd?.open ? wd.periods || [] : [];
}

/**
 * Parte "da proprietária" do documento do dia.
 * @returns {{shut: boolean, off: Record<string, true>}}
 */
export function buildDay(settings, day, blocks = []) {
  const mine = blocks.filter((b) => b.day === day);
  const periods = periodsOf(settings, day);
  if (!periods.length || mine.some((b) => b.allDay)) return { shut: true, off: {} };
  const open = new Array(ATOMS_PER_DAY).fill(false);
  for (const p of periods) for (let i = atomOf(p.s); i < atomOf(p.e); i++) open[i] = true;
  for (const b of mine) for (let i = atomOf(b.s); i < atomOf(b.e); i++) open[i] = false;
  const off = {};
  for (let i = 0; i < ATOMS_PER_DAY; i++) if (!open[i]) off[i] = true;
  return { shut: Object.keys(off).length === ATOMS_PER_DAY, off };
}

/** Momento em que uma retenção pendente deixa de valer. */
export function holdExpiresMs(hold, day, offsetMin) {
  const start = instantOf(day, hold.s * ATOM_MIN, offsetMin);
  return Math.min(hold.c + hold.a * 60000, start - APPROVAL_MARGIN_MIN * 60000);
}

/** Retenções vencidas de um dia: [bid, hold]. */
export function expiredHolds(dayDoc, nowMs, offsetMin) {
  return Object.entries(dayDoc?.holds || {}).filter(([, h]) => nowMs > holdExpiresMs(h, dayDoc.day, offsetMin));
}

/** Átomos ocupados, desconsiderando retenções vencidas. */
function busyNow(dayDoc, nowMs, offsetMin) {
  const expired = nowMs == null ? [] : expiredHolds(dayDoc, nowMs, offsetMin);
  if (!expired.length) return dayDoc.busy || {};
  const busy = { ...dayDoc.busy };
  for (const [, h] of expired) for (let i = h.s; i < h.s + h.n; i++) delete busy[i];
  return busy;
}

/**
 * Quantos átomos uma reserva ocuparia começando em `start`, ou 0 se não couber.
 * O atendimento precisa caber inteiro em tempo livre. O intervalo depois dele pode ser cortado
 * pelo fim do expediente, por uma pausa ou por um bloqueio, mas nunca pode cair sobre outra reserva.
 */
export function claim(dayDoc, start, service, nowMs = null, offsetMin = 0) {
  if (!dayDoc || dayDoc.shut) return 0;
  const dur = service.duration / ATOM_MIN;
  const buf = (service.buffer || 0) / ATOM_MIN;
  if (!Number.isInteger(start) || !Number.isInteger(dur) || !Number.isInteger(buf)) return 0;
  if (start < 0 || dur < 1 || buf < 0 || dur + buf > MAX_CLAIM_ATOMS) return 0;
  const off = dayDoc.off || {};
  const busy = busyNow(dayDoc, nowMs, offsetMin);
  for (let i = start; i < start + dur; i++) {
    if (i >= ATOMS_PER_DAY || off[i] || busy[i]) return 0;
  }
  let n = dur;
  for (let i = start + dur; i < start + dur + buf; i++) {
    if (i >= ATOMS_PER_DAY || off[i]) break;
    if (busy[i]) return 0;
    n++;
  }
  return n;
}

/** Antecedência mínima efetiva, em minutos, para reservas públicas. */
export function minAdvanceOf(rules) {
  return rules.mode === 'approval' ? Math.max(rules.minAdvanceMin, APPROVAL_MIN_ADVANCE_MIN) : rules.minAdvanceMin;
}

/** Último dia que o público pode reservar. */
export function lastPublicDay(nowMs, settings) {
  return addDays(todayOf(nowMs, settings.utcOffsetMin), settings.rules.maxDays);
}

/**
 * Inícios possíveis para um serviço em um dia.
 * @param ctx {{nowMs: number, settings: object, actor: 'public'|'owner'}}
 * @returns {{start: number, n: number, minutes: number, label: string}[]}
 */
export function listSlots(dayDoc, service, ctx) {
  if (!dayDoc || dayDoc.shut) return [];
  const { nowMs, settings, actor = 'public' } = ctx;
  const offset = settings.utcOffsetMin;
  const today = todayOf(nowMs, offset);
  const ahead = daysBetween(today, dayDoc.day);
  if (ahead < 0) return [];
  let earliest = -Infinity;
  if (actor === 'public') {
    if (ahead > settings.rules.maxDays) return [];
    earliest = nowMs + minAdvanceOf(settings.rules) * 60000;
  }
  const step = Math.max(1, atomOf(settings.rules.slotStepMin));
  const off = dayDoc.off || {};
  const busy = busyNow(dayDoc, nowMs, offset);
  const starts = new Set();
  let runStart = -1;
  for (let i = 0; i <= ATOMS_PER_DAY; i++) {
    const isOpen = i < ATOMS_PER_DAY && !off[i];
    if (isOpen && runStart < 0) runStart = i;
    if (isOpen && (i - runStart) % step === 0) starts.add(i);
    // encostar no atendimento anterior evita buracos na agenda
    if (isOpen && !busy[i] && i > 0 && busy[i - 1]) starts.add(i);
    if (!isOpen) runStart = -1;
  }
  const slots = [];
  for (const start of [...starts].sort((a, b) => a - b)) {
    const minutes = start * ATOM_MIN;
    if (instantOf(dayDoc.day, minutes, offset) < earliest) continue;
    const n = claim(dayDoc, start, service, nowMs, offset);
    if (n) slots.push({ start, n, minutes, label: fmtTime(minutes) });
  }
  return slots;
}

/** Primeiro dia, a partir de `fromDay`, com pelo menos um horário. `days`: mapa dia → documento. */
export function nextDayWithSlots(days, fromDay, service, ctx) {
  const sorted = Object.keys(days).map(Number).filter((d) => d >= fromDay).sort((a, b) => a - b);
  for (const day of sorted) if (listSlots(days[day], service, ctx).length) return day;
  return null;
}
