import { ATOM_MIN, addDays, instantOf, localOf } from '../../public/js/core/time.js';
import { todayOf } from '../../public/js/core/schedule.js';
import { OFFSET, HOUR } from './_env.mjs';

/**
 * Um horário de teste que não depende da hora em que a suíte roda.
 *
 * - `hours >= 24`: horário fixo de calendário, sempre entre 08:00 e 19:00 —
 *   dia = hoje + 1 + ⌊hours/12⌋, hora = 08:00 + (hours mod 12). Valores inteiros diferentes dão
 *   horários diferentes, a pelo menos 1 h de distância (nenhum atendimento de teste passa disso).
 * - `hours < 24`: relativo a agora (para testar antecedência e prazos), arredondado para a próxima meia
 *   hora; se cair depois das 23:00 recua para 23:00, para o atendimento não atravessar a meia-noite.
 *
 * Antes, todos eram relativos a agora: rodando por volta das 14:30 de Manaus, "daqui a 33 h" caía às
 * 23:30 e a reserva de teste atravessava a meia-noite (recusada, corretamente, pelo sistema).
 */
export function slotIn(hours, nowMs = Date.now()) {
  if (hours >= 24) {
    const day = addDays(todayOf(nowMs, OFFSET), 1 + Math.floor(hours / 12));
    const minutes = (8 + (hours % 12)) * 60;
    return { day, start: minutes / ATOM_MIN, ms: instantOf(day, minutes, OFFSET) };
  }
  const step = 30 * 60000;
  const ms = Math.ceil((nowMs + hours * HOUR) / step) * step;
  const { day, minutes } = localOf(ms, OFFSET);
  const safe = Math.min(minutes, 23 * 60);
  return { day, start: safe / ATOM_MIN, ms: instantOf(day, safe, OFFSET) };
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
