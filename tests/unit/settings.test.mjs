import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, normalizeSettings, normalizeService, SettingsError } from '../../public/js/core/settings.js';

const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof SettingsError, String(e)); return e.code; } return null; };

test('valores iniciais da demonstração seguem o briefing e são editáveis', () => {
  const s = defaultSettings();
  assert.equal(s.rules.mode, 'auto');
  assert.equal(s.rules.minAdvanceMin, 120);
  assert.equal(s.rules.maxDays, 30);
  assert.equal(s.rules.cancelLimitMin, 720);
  assert.equal(s.rules.paused, false);
  assert.equal(s.timezone, 'America/Manaus');
  assert.equal(s.utcOffsetMin, -240);
  assert.equal(s.week[0].open, false);
  assert.deepEqual(normalizeSettings(s), s);
});

test('normalizeSettings calcula o deslocamento a partir do fuso escolhido', () => {
  const s = normalizeSettings({ ...defaultSettings(), timezone: 'America/Sao_Paulo', utcOffsetMin: 999 });
  assert.equal(s.utcOffsetMin, -180);
});

test('normalizeSettings ordena períodos, junta os que se tocam e arredonda para 5 minutos', () => {
  const base = defaultSettings();
  const s = normalizeSettings({ ...base, week: { ...base.week, 1: { open: true, periods: [{ s: 780, e: 1080 }, { s: 541, e: 720 }, { s: 720, e: 750 }] } } });
  assert.deepEqual(s.week[1].periods, [{ s: 540, e: 750 }, { s: 780, e: 1080 }]);
});

test('dia marcado como aberto sem período válido vira fechado', () => {
  const base = defaultSettings();
  const s = normalizeSettings({ ...base, week: { ...base.week, 2: { open: true, periods: [] } } });
  assert.equal(s.week[2].open, false);
});

test('recusa período invertido, regra fora do limite e nome vazio', () => {
  const base = defaultSettings();
  assert.equal(code(() => normalizeSettings({ ...base, week: { ...base.week, 1: { open: true, periods: [{ s: 720, e: 540 }] } } })), 'invalid_period');
  assert.equal(code(() => normalizeSettings({ ...base, rules: { ...base.rules, maxDays: 0 } })), 'invalid_rule');
  assert.equal(code(() => normalizeSettings({ ...base, rules: { ...base.rules, mode: 'talvez' } })), 'invalid_rule');
  assert.equal(code(() => normalizeSettings({ ...base, business: { ...base.business, name: '  ' } })), 'invalid_name');
  assert.equal(code(() => normalizeSettings({ ...base, timezone: 'Lugar/Nenhum' })), 'invalid_timezone');
});

test('exceções por data: fechado ou horário especial; entradas inválidas são descartadas', () => {
  const base = defaultSettings();
  const s = normalizeSettings({ ...base, exceptions: { 20261225: { closed: true }, 20261224: { periods: [{ s: 540, e: 720 }] }, lixo: { closed: true }, 20261231: { periods: [] } } });
  assert.deepEqual(s.exceptions, { 20261225: { closed: true }, 20261224: { periods: [{ s: 540, e: 720 }] }, 20261231: { closed: true } });
});

test('cor principal precisa ser hexadecimal; logo aceita só imagem embutida pequena', () => {
  const base = defaultSettings();
  assert.equal(normalizeSettings({ ...base, business: { ...base.business, accent: 'red' } }).business.accent, base.business.accent);
  assert.equal(normalizeSettings({ ...base, business: { ...base.business, accent: '#AABBCC' } }).business.accent, '#aabbcc');
  assert.equal(normalizeSettings({ ...base, business: { ...base.business, logo: 'https://exemplo.test/x.png' } }).business.logo, '');
  assert.equal(code(() => normalizeSettings({ ...base, business: { ...base.business, logo: 'data:image/png;base64,' + 'A'.repeat(200000) } })), 'logo_too_big');
});

test('normalizeService valida duração, intervalo, preço e limite de 4 horas', () => {
  const s = normalizeService({ id: 'x', name: '  Pé  ', description: '', price: 3000, duration: 47, buffer: 12, active: true, order: 2 });
  assert.deepEqual(s, { id: 'x', name: 'Pé', description: '', price: 3000, duration: 45, buffer: 10, active: true, order: 2 });
  assert.equal(code(() => normalizeService({ name: '', price: 1, duration: 30 })), 'invalid_name');
  assert.equal(code(() => normalizeService({ name: 'A', price: -1, duration: 30 })), 'invalid_price');
  assert.equal(code(() => normalizeService({ name: 'A', price: 1, duration: 0 })), 'invalid_duration');
  assert.equal(code(() => normalizeService({ name: 'A', price: 1, duration: 240, buffer: 10 })), 'too_long');
  assert.match(normalizeService({ name: 'Novo', price: 1, duration: 30 }).id, /^[A-Za-z0-9_-]{6,}$/);
});
