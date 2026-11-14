// Dados fictícios usados pelos testes de unidade.
export const MANAUS = -240;

export function settings(over = {}) {
  const open = { open: true, periods: [{ s: 9 * 60, e: 12 * 60 }, { s: 13 * 60, e: 18 * 60 }] };
  const base = {
    timezone: 'America/Manaus',
    utcOffsetMin: MANAUS,
    week: {
      0: { open: false, periods: [] },
      1: open, 2: open, 3: open, 4: open, 5: open,
      6: { open: true, periods: [{ s: 9 * 60, e: 13 * 60 }] },
    },
    exceptions: {},
    rules: {
      mode: 'auto', minAdvanceMin: 120, maxDays: 30, slotStepMin: 30,
      cancelLimitMin: 720, approvalMin: 720, paused: false,
    },
  };
  return { ...base, ...over, rules: { ...base.rules, ...(over.rules || {}) } };
}

export const svc = (over = {}) => ({
  id: 'mao', name: 'Mão', description: '', price: 3500, duration: 45, buffer: 10, active: true, order: 1, ...over,
});

// Segunda-feira, 16/11/2026; "agora" = sábado 14/11/2026 08:00 em Manaus.
export const MONDAY = 20261116;
export const NOW = Date.parse('2026-11-14T12:00:00Z');

export const at = (h, m = 0) => (h * 60 + m) / 5; // horário → átomo
