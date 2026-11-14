// Configuração do negócio: valores iniciais, limpeza e validação antes de gravar.
// As regras do Firestore conferem de novo os campos de que dependem.

import { offsetMinutesOf } from './time.js';
import { cleanText, normalizePhone } from './validate.js';
import { MAX_CLAIM_ATOMS } from './constants.js';
import { newId } from './ids.js';

export class SettingsError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SettingsError';
    this.code = code;
  }
}

const fail = (code, detail) => { throw new SettingsError(code, detail); };
const round5 = (n) => Math.round(Number(n) / 5) * 5;
const MAX_LOGO_CHARS = 120000;

export const DEFAULT_ACCENT = '#8b2f4b';

export const DEFAULT_PRIVACY =
  'Usamos seu nome e telefone apenas para registrar e confirmar seu horário e para falar com você sobre ele. ' +
  'Não vendemos nem compartilhamos seus dados; eles só passam pelos serviços que fazem o sistema funcionar ' +
  '(hospedagem e aviso por e-mail ao estabelecimento). Para corrigir ou apagar seus dados, fale com o estabelecimento.';

export function defaultSettings() {
  const weekday = () => ({ open: true, periods: [{ s: 540, e: 720 }, { s: 780, e: 1080 }] });
  return {
    business: { name: 'Meu negócio', tagline: '', phone: '', address: '', accent: DEFAULT_ACCENT, logo: '' },
    privacy: { text: DEFAULT_PRIVACY },
    timezone: 'America/Manaus',
    utcOffsetMin: -240,
    week: {
      0: { open: false, periods: [] },
      1: weekday(), 2: weekday(), 3: weekday(), 4: weekday(), 5: weekday(),
      6: { open: true, periods: [{ s: 540, e: 780 }] },
    },
    exceptions: {},
    rules: {
      mode: 'auto', minAdvanceMin: 120, maxDays: 30, slotStepMin: 30,
      cancelLimitMin: 720, approvalMin: 720, paused: false,
    },
  };
}

/** Ordena, arredonda para 5 min e junta períodos que se tocam. */
export function normalizePeriods(periods) {
  const list = (periods || []).map((p) => ({ s: round5(p.s), e: round5(p.e) }));
  for (const p of list) {
    if (!Number.isFinite(p.s) || !Number.isFinite(p.e) || p.s < 0 || p.e > 1440 || p.s >= p.e) fail('invalid_period');
  }
  list.sort((a, b) => a.s - b.s);
  const out = [];
  for (const p of list) {
    const last = out[out.length - 1];
    if (last && p.s <= last.e) last.e = Math.max(last.e, p.e);
    else out.push(p);
  }
  return out;
}

function intRule(value, min, max, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail('invalid_rule', name);
  return n;
}

function normalizeLogo(logo) {
  const text = String(logo || '');
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(text)) return '';
  if (text.length > MAX_LOGO_CHARS) fail('logo_too_big');
  return text;
}

export function normalizeSettings(raw) {
  const base = defaultSettings();
  const business = raw.business || {};
  const name = cleanText(business.name, 60);
  if (!name) fail('invalid_name');
  const accent = /^#[0-9a-fA-F]{6}$/.test(business.accent || '') ? business.accent.toLowerCase() : base.business.accent;

  const timezone = String(raw.timezone || base.timezone);
  let utcOffsetMin;
  try {
    utcOffsetMin = round5(offsetMinutesOf(timezone));
  } catch {
    fail('invalid_timezone');
  }

  const week = {};
  for (let wd = 0; wd < 7; wd++) {
    const day = raw.week?.[wd] || { open: false, periods: [] };
    const periods = day.open ? normalizePeriods(day.periods) : [];
    week[wd] = { open: periods.length > 0, periods };
  }

  const exceptions = {};
  for (const [key, ex] of Object.entries(raw.exceptions || {})) {
    if (!/^\d{8}$/.test(key) || !ex) continue;
    const periods = ex.closed ? [] : normalizePeriods(ex.periods);
    exceptions[key] = periods.length ? { periods } : { closed: true };
  }

  const r = raw.rules || {};
  if (r.mode !== 'auto' && r.mode !== 'approval') fail('invalid_rule', 'mode');
  const slotStepMin = intRule(r.slotStepMin, 5, 120, 'slotStepMin');
  if (slotStepMin % 5) fail('invalid_rule', 'slotStepMin');

  return {
    business: {
      name,
      tagline: cleanText(business.tagline, 90),
      phone: normalizePhone(business.phone),
      address: cleanText(business.address, 160),
      accent,
      logo: normalizeLogo(business.logo),
    },
    privacy: { text: cleanText(raw.privacy?.text ?? base.privacy.text, 1200) },
    timezone,
    utcOffsetMin,
    week,
    exceptions,
    rules: {
      mode: r.mode,
      minAdvanceMin: intRule(r.minAdvanceMin, 0, 43200, 'minAdvanceMin'),
      maxDays: intRule(r.maxDays, 1, 365, 'maxDays'),
      slotStepMin,
      cancelLimitMin: intRule(r.cancelLimitMin, 0, 43200, 'cancelLimitMin'),
      approvalMin: intRule(r.approvalMin, 30, 10080, 'approvalMin'),
      paused: r.paused === true,
    },
  };
}

export function normalizeService(raw) {
  const name = cleanText(raw.name, 60);
  if (!name) fail('invalid_name');
  const price = Math.round(Number(raw.price));
  if (!Number.isFinite(price) || price < 0 || price > 10000000) fail('invalid_price');
  const duration = round5(raw.duration);
  if (!Number.isFinite(duration) || duration < 5) fail('invalid_duration');
  const buffer = round5(raw.buffer || 0);
  if (!Number.isFinite(buffer) || buffer < 0) fail('invalid_duration');
  if ((duration + buffer) / 5 > MAX_CLAIM_ATOMS) fail('too_long');
  return {
    id: /^[A-Za-z0-9_-]{1,40}$/.test(raw.id || '') ? raw.id : newId(),
    name,
    description: cleanText(raw.description, 140),
    price, duration, buffer,
    active: raw.active !== false,
    order: Number.isInteger(raw.order) ? raw.order : 0,
  };
}
