// Exportação e recuperação dos dados em JSON documentado (docs/REGRAS.md, seção "Cópia de segurança").
// Isto é uma exportação manual, não um backup automático.

import { STATUS, effectiveStatus } from './booking.js';

export const BACKUP_FORMAT = 'agenda-base/backup';
export const BACKUP_VERSION = 1;

export class BackupError extends Error {
  constructor(code) {
    super(code);
    this.name = 'BackupError';
    this.code = code;
  }
}

const TIME_FIELDS = ['startAt', 'createdAt', 'updatedAt', 'pendingSince'];
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const ms = (text) => (text == null ? null : Date.parse(text));

export function buildExport({ settings, services, blocks, bookings, nowMs }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: iso(nowMs),
    settings: settings || null,
    services: services || [],
    blocks: blocks || [],
    bookings: [...(bookings || [])].sort((a, b) => a.startAt - b.startAt).map((b) => {
      const { effectiveStatus: _e, expiresAt: _x, ...rest } = b;
      const out = { ...rest };
      for (const f of TIME_FIELDS) out[f] = iso(b[f]);
      return out;
    }),
  };
}

function parseBooking(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw.token || '') || !/^[A-Za-z0-9_-]{20}$/.test(raw.bid || '')) return null;
  const b = { ...raw };
  for (const f of TIME_FIELDS) b[f] = ms(raw[f]);
  const ints = [b.day, b.start, b.n, b.startAt, b.createdAt];
  if (!ints.every(Number.isFinite)) return null;
  if (!Object.values(STATUS).includes(b.status)) return null;
  if (!b.service || !b.customer || typeof b.customer.name !== 'string' || typeof b.customer.phone !== 'string') return null;
  return b;
}

/**
 * Decide o que fazer com cada item de um arquivo exportado.
 * - reservas cujo token já existe são puladas (importar duas vezes não duplica);
 * - reservas futuras pendentes/confirmadas voltam a ocupar a agenda (`active`);
 * - todo o resto entra como histórico, sem ocupar agenda (`history`).
 */
export function planImport(data, { existingTokens, nowMs }) {
  if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.bookings)) throw new BackupError('invalid_format');
  if (data.version !== BACKUP_VERSION) throw new BackupError('unsupported_version');
  const plan = {
    settings: data.settings || null,
    services: Array.isArray(data.services) ? data.services : [],
    blocks: Array.isArray(data.blocks) ? data.blocks.filter((b) => b && b.id && Number.isInteger(b.day)) : [],
    active: [], history: [], skipped: 0,
  };
  const seen = new Set(existingTokens);
  for (const raw of data.bookings) {
    const b = parseBooking(raw);
    if (!b || seen.has(b.token)) { plan.skipped++; continue; }
    seen.add(b.token);
    const state = effectiveStatus(b, nowMs);
    if (state === STATUS.EXPIRED && b.status === STATUS.PENDING) {
      plan.history.push({ ...b, status: STATUS.EXPIRED, pendingSince: null });
    } else if ((state === STATUS.PENDING || state === STATUS.CONFIRMED) && b.startAt > nowMs) {
      plan.active.push(b);
    } else {
      plan.history.push(state === STATUS.PENDING ? { ...b, status: STATUS.EXPIRED, pendingSince: null } : b);
    }
  }
  return plan;
}
