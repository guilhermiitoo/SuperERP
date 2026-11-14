// Tempo do estabelecimento.
// Um "dia" é o inteiro AAAAMMDD no fuso do estabelecimento; horários são minutos desde 00:00 local.
// A agenda usa "átomos" de 5 minutos: 288 por dia.

export const ATOM_MIN = 5;
export const ATOMS_PER_DAY = 288;
const DAY_MS = 86400000;

export const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function dayIdOf(y, m, d) {
  return y * 10000 + m * 100 + d;
}

export function partsOf(day) {
  return { y: Math.floor(day / 10000), m: Math.floor(day / 100) % 100, d: day % 100 };
}

function utcOfDay(day) {
  const { y, m, d } = partsOf(day);
  return Date.UTC(y, m - 1, d);
}

function dayOfUtc(ms) {
  const dt = new Date(ms);
  return dayIdOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(day, n) {
  return dayOfUtc(utcOfDay(day) + n * DAY_MS);
}

export function weekdayOf(day) {
  return new Date(utcOfDay(day)).getUTCDay();
}

export function daysBetween(a, b) {
  return Math.round((utcOfDay(b) - utcOfDay(a)) / DAY_MS);
}

/** Instante (ms UTC) de um horário local. offsetMin: minutos a leste de UTC (Manaus = -240). */
export function instantOf(day, minutes, offsetMin) {
  return utcOfDay(day) + (minutes - offsetMin) * 60000;
}

/** Dia e minutos locais de um instante. */
export function localOf(ms, offsetMin) {
  const shifted = ms + offsetMin * 60000;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return { day: dayOfUtc(dayStart), minutes: Math.floor((shifted - dayStart) / 60000) };
}

/** Deslocamento atual do fuso IANA em minutos a leste de UTC. */
export function offsetMinutesOf(timeZone, ms = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const p = {};
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

const pad = (n) => String(n).padStart(2, '0');

export function fmtTime(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function parseTime(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && total <= 1440 ? total : null;
}

export function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function fmtDayLong(day) {
  const { m, d } = partsOf(day);
  return `${WEEKDAYS[weekdayOf(day)]}, ${d} de ${MONTHS[m - 1]}`;
}

export function fmtDayShort(day) {
  const { m, d } = partsOf(day);
  return `${WEEKDAYS_SHORT[weekdayOf(day)]}., ${pad(d)}/${pad(m)}`;
}

export function fmtDayNumeric(day) {
  const { y, m, d } = partsOf(day);
  return `${pad(d)}/${pad(m)}/${y}`;
}

export function fmtMoney(cents) {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${whole},${pad(cents % 100)}`;
}

/** "2026-11-14" ↔ 20261114, para campos <input type="date">. */
export function dayToIso(day) {
  const { y, m, d } = partsOf(day);
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function isoToDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  return m ? dayIdOf(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}
