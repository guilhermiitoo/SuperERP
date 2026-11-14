// Camada de dados: uma única orquestração para os dois modos (Firebase e demonstração).
// Lê o estado dentro de uma transação, pede o plano ao núcleo (core/booking.js) e grava tudo
// de uma vez. O backend só sabe ler e gravar; as regras de negócio ficam no núcleo.

import {
  BookingError, STATUS, effectiveStatus, expiresAtMs, planApprove, planCancel, planCreate, planDecline,
  planEditCustomer, planExpire, planFinish, planReleaseHold, planReopen, planReschedule,
} from '../core/booking.js';
import { buildDay, expiredHolds, todayOf } from '../core/schedule.js';
import { addDays } from '../core/time.js';
import { normalizeService, normalizeSettings, SettingsError } from '../core/settings.js';
import { cleanText } from '../core/validate.js';
import { MATERIALIZE_MARGIN_DAYS } from '../core/constants.js';
import { newBid, newId, randomToken } from '../core/ids.js';
import { buildExport, planImport } from '../core/backup.js';

/** Sinal interno: há retenções vencidas no dia; libere-as e tente de novo. */
class ReleaseFirst {
  constructor(day, bids) { this.day = day; this.bids = bids; }
}

const sameKeys = (a = {}, b = {}) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => k in b);
};

export function createStore(backend, { now = () => Date.now() } = {}) {
  const decorate = (b) => (b ? { ...b, effectiveStatus: effectiveStatus(b, now()), expiresAt: expiresAtMs(b) } : null);
  const byStart = (a, b) => a.startAt - b.startAt;

  async function releaseHolds(day, bids) {
    for (const bid of bids) {
      try {
        await backend.transaction(async (t) => {
          const [settings, dayDoc] = await Promise.all([t.config(), t.day(day)]);
          t.write(planReleaseHold({ dayDoc, bid, nowMs: now(), offsetMin: settings.utcOffsetMin }));
        });
      } catch {
        // outra pessoa já liberou, ou para o servidor ainda não venceu: o plano seguinte decide
      }
    }
  }

  /** Transação com duas recuperações: liberar retenções vencidas e repetir uma negação do servidor. */
  async function transact(fn) {
    let released = 0;
    let denied = 0;
    for (;;) {
      try {
        return await backend.transaction((t) => fn(t, released < 2));
      } catch (e) {
        if (e instanceof ReleaseFirst) {
          released++;
          await releaseHolds(e.day, e.bids);
        } else if (e?.code === 'permission-denied' && denied === 0) {
          denied++; // o estado pode ter mudado entre a leitura e a gravação: relê e replaneja uma vez
        } else {
          throw e;
        }
      }
    }
  }

  function staleCheck(dayDoc, settings, enabled) {
    if (!enabled || !dayDoc) return;
    const stale = expiredHolds(dayDoc, now(), settings.utcOffsetMin);
    if (stale.length) throw new ReleaseFirst(dayDoc.day, stale.map(([bid]) => bid));
  }

  async function change(token, planFn) {
    const booking = await transact(async (t, canRelease) => {
      const b = await t.booking(token);
      if (!b) throw new BookingError('not_found');
      const plan = await planFn(b, t, canRelease);
      t.write(plan);
      return plan.booking;
    });
    return decorate(booking);
  }

  async function syncDays({ fromDay, toDay } = {}) {
    const settings = await backend.getConfig();
    if (!settings) return { created: 0, updated: 0 };
    const today = todayOf(now(), settings.utcOffsetMin);
    const from = fromDay ?? addDays(today, -1);
    const to = toDay ?? addDays(today, settings.rules.maxDays + MATERIALIZE_MARGIN_DAYS);
    const [existing, blocks] = await Promise.all([backend.getDays(from, to), backend.listBlocks(from)]);
    const creates = [];
    const updates = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const want = buildDay(settings, day, blocks);
      const have = existing[day];
      if (!have) creates.push({ day, ...want });
      else if (have.shut !== want.shut || !sameKeys(have.off, want.off)) updates.push({ day, ...want });
    }
    if (creates.length || updates.length) await backend.putDays(creates, updates);
    return { created: creates.length, updated: updates.length };
  }

  return {
    kind: backend.kind,
    now,

    // ---------- público
    async loadBusiness() {
      const [settings, services] = await Promise.all([backend.getConfig(), backend.listServices({ activeOnly: true })]);
      return { settings, services: services.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)) };
    },

    loadDays: (fromDay, toDay) => backend.getDays(fromDay, toDay),

    async createBooking({ serviceId, day, start, customer, source = 'public' }) {
      const token = randomToken();
      const bid = newBid();
      const booking = await transact(async (t, canRelease) => {
        const [settings, service, dayDoc] = await Promise.all([t.config(), t.service(serviceId), t.day(day)]);
        if (!settings) throw new BookingError('not_ready');
        staleCheck(dayDoc, settings, canRelease);
        const plan = planCreate({ dayDoc, settings, service, start, customer, source, nowMs: now(), token, bid });
        t.write(plan);
        return plan.booking;
      });
      return decorate(booking);
    },

    async getBooking(token) {
      return decorate(await backend.getBooking(token));
    },

    cancelBooking: (token, actor) => change(token, (b) => planCancel({ booking: b, actor, nowMs: now() })),

    rescheduleBooking: (token, { day, start }, actor) => change(token, async (b, t, canRelease) => {
      const [settings, toDay] = await Promise.all([t.config(), t.day(day)]);
      const fromDay = day === b.day ? toDay : await t.day(b.day);
      staleCheck(toDay, settings, canRelease);
      return planReschedule({ booking: b, fromDay, toDay, start, actor, settings, nowMs: now() });
    }),

    // ---------- painel
    approveBooking: (token) => change(token, (b) => planApprove({ booking: b, nowMs: now() })),
    declineBooking: (token) => change(token, (b) => planDecline({ booking: b, nowMs: now() })),
    finishBooking: (token, outcome) => change(token, (b) => planFinish({ booking: b, outcome, nowMs: now() })),
    reopenBooking: (token) => change(token, (b) => planReopen({ booking: b, nowMs: now() })),
    updateCustomer: (token, customer) => change(token, (b) => planEditCustomer({ booking: b, customer, nowMs: now() })),
    expireBooking: (token) => change(token, async (b, t) => planExpire({ booking: b, dayDoc: await t.day(b.day), nowMs: now() })),

    /** Grava "expirado" nas solicitações que venceram sem resposta. */
    async sweepExpired() {
      const pending = await backend.queryBookings({ status: STATUS.PENDING });
      let expired = 0;
      for (const b of pending) {
        if (effectiveStatus(b, now()) !== STATUS.EXPIRED) continue;
        try {
          await this.expireBooking(b.token);
          expired++;
        } catch {
          // outra aba do painel pode ter gravado antes
        }
      }
      return { expired };
    },

    async listBookings({ fromDay, toDay }) {
      return (await backend.queryBookings({ fromDay, toDay })).map(decorate).sort(byStart);
    },

    async listPending() {
      const list = (await backend.queryBookings({ status: STATUS.PENDING })).map(decorate);
      return list.filter((b) => b.effectiveStatus === STATUS.PENDING).sort(byStart);
    },

    async listRecent(limit = 400) {
      return (await backend.queryBookings({ limit })).map(decorate);
    },

    async deleteBooking(token) {
      const b = await backend.getBooking(token);
      if (!b) return;
      if (b.status === STATUS.PENDING || b.status === STATUS.CONFIRMED) throw new BookingError('not_allowed');
      await backend.removeBooking(b);
    },

    async saveSettings(raw) {
      const settings = normalizeSettings(raw);
      await backend.putConfig(settings);
      return settings;
    },

    async listServices() {
      return (await backend.listServices({ activeOnly: false })).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    },

    async saveService(raw) {
      const service = normalizeService(raw);
      await backend.putService(service);
      return service;
    },

    deleteService: (id) => backend.removeService(id),

    async listBlocks() {
      const settings = await backend.getConfig();
      const from = addDays(todayOf(now(), settings?.utcOffsetMin ?? 0), -1);
      return (await backend.listBlocks(from)).sort((a, b) => a.day - b.day || a.s - b.s);
    },

    async saveBlock(raw) {
      const allDay = raw.allDay === true;
      const block = {
        id: raw.id || newId(),
        day: Number(raw.day),
        allDay,
        s: allDay ? 0 : Math.round(raw.s / 5) * 5,
        e: allDay ? 1440 : Math.round(raw.e / 5) * 5,
        note: cleanText(raw.note, 80),
      };
      if (!Number.isInteger(block.day) || !(block.s < block.e) || block.s < 0 || block.e > 1440) throw new SettingsError('invalid_period');
      await backend.putBlock(block);
      await syncDays({ fromDay: block.day, toDay: block.day });
      return block;
    },

    async deleteBlock(block) {
      await backend.removeBlock(block.id);
      await syncDays({ fromDay: block.day, toDay: block.day });
    },

    syncDays,

    // ---------- cópia de segurança
    async exportAll() {
      const [settings, services, blocks, bookings] = await Promise.all([
        backend.getConfig(), backend.listServices({ activeOnly: false }), backend.listBlocks(0), backend.queryBookings({}),
      ]);
      return buildExport({ settings, services, blocks, bookings, nowMs: now() });
    },

    /**
     * Restaura um arquivo exportado. Não apaga nada: o que já existe (mesmo identificador) é mantido.
     * @returns relatório com o que entrou, o que foi pulado e o que conflitou.
     */
    async importAll(data, { replaceSettings = false } = {}) {
      const existing = await backend.queryBookings({});
      const plan = planImport(data, { existingTokens: new Set(existing.map((b) => b.token)), nowMs: now() });
      const report = { settings: false, services: 0, blocks: 0, history: 0, active: 0, skipped: plan.skipped, conflicts: [] };
      const current = await backend.getConfig();
      if (plan.settings && (replaceSettings || !current)) {
        await backend.putConfig(normalizeSettings(plan.settings));
        report.settings = true;
      }
      for (const s of plan.services) { await backend.putService(normalizeService(s)); report.services++; }
      for (const b of plan.blocks) { await backend.putBlock(b); report.blocks++; }
      await syncDays();
      for (const b of plan.history) { await backend.restoreBooking(b); report.history++; }
      for (const b of plan.active) {
        try {
          await backend.transaction(async (t) => {
            const dayDoc = await t.day(b.day);
            if (!dayDoc) throw new BookingError('slot_taken');
            const free = Array.from({ length: b.n }, (_, i) => b.start + i).every((k) => !dayDoc.busy?.[k]);
            if (!free) throw new BookingError('slot_taken');
            const pending = b.status === STATUS.PENDING;
            const booking = { ...b, rev: 1, updatedAt: now(), pendingSince: pending ? now() : null };
            t.write({
              booking,
              keepCreatedAt: true,
              dayOps: [{
                day: b.day, add: Array.from({ length: b.n }, (_, i) => b.start + i), remove: [],
                holdSet: pending ? { bid: b.bid, hold: { s: b.start, n: b.n, c: now(), a: b.approvalMin } } : null,
                holdDel: null, op: { bid: b.bid, rev: 1 },
              }],
            });
          });
          report.active++;
        } catch (e) {
          report.conflicts.push({ token: b.token, name: b.customer.name, day: b.day, start: b.start, reason: e.code || 'error' });
        }
      }
      return report;
    },

    // ---------- acesso
    signIn: (email, password) => backend.signIn(email, password),
    signOut: () => backend.signOut(),
    sendReset: (email) => backend.sendReset(email),
    onAuth: (cb) => backend.onAuth(cb),
    currentUser: () => backend.currentUser(),
    isOwner: () => backend.isOwner(),
  };
}

export { BookingError, SettingsError };
