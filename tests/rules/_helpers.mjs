import { ATOM_MIN, localOf } from '../../public/js/core/time.js';
import { OFFSET, HOUR } from './_env.mjs';

/** Dia e átomo de um horário daqui a `hours` horas, arredondado para a próxima meia hora. */
export function slotIn(hours, nowMs = Date.now()) {
  const step = 30 * 60000;
  const ms = Math.ceil((nowMs + hours * HOUR) / step) * step;
  const { day, minutes } = localOf(ms, OFFSET);
  return { day, start: minutes / ATOM_MIN, ms };
}

export const busyKeys = (dayDoc) => Object.keys(dayDoc.busy || {}).map(Number).sort((a, b) => a - b);
export const range = (start, n) => Array.from({ length: n }, (_, i) => start + i);

export async function settled(promises) {
  const results = await Promise.allSettled(promises);
  return {
    ok: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    failed: results.filter((r) => r.status === 'rejected').map((r) => r.reason),
  };
}
