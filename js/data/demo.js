// Backend de demonstração: guarda tudo no navegador (localStorage), com dados fictícios.
// Serve para experimentar e para os testes de interface. NÃO é para produção: não há servidor,
// não há separação real entre visitante e proprietária e os dados ficam só neste aparelho.

import { BookingError } from '../core/booking.js';
import { createStore } from './store.js';

const KEY = 'agenda-base-demo-v1';
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const DEMO_USER = Object.freeze({ uid: 'demo', email: 'demonstracao@exemplo.test' });

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

export function resetDemo(storage) {
  storage.removeItem(KEY);
}

function denied() {
  const e = new Error('permission-denied');
  e.code = 'permission-denied';
  return e;
}

/** Confere o plano como o servidor faria: nada de ocupar átomo ocupado ou liberar átomo livre. */
function applyPlan(state, plan) {
  for (const op of plan.dayOps) {
    const d = state.days[op.day];
    if (!d) throw denied();
    if (op.remove.some((k) => !d.busy[k])) throw denied();
    if (op.add.some((k) => d.shut || d.busy[k] || d.off[k])) throw denied();
  }
  for (const op of plan.dayOps) {
    const d = state.days[op.day];
    for (const k of op.remove) delete d.busy[k];
    for (const k of op.add) d.busy[k] = true;
    if (op.holdDel) delete d.holds[op.holdDel];
    if (op.holdSet) d.holds[op.holdSet.bid] = op.holdSet.hold;
  }
  if (plan.booking) {
    const { effectiveStatus: _e, expiresAt: _x, ...b } = plan.booking;
    state.bookings[b.token] = b;
  }
}

export function demoBackend({ storage, latency = 0 }) {
  const empty = () => ({ config: null, services: {}, blocks: {}, days: {}, bookings: {}, session: false });
  const raw = () => storage.getItem(KEY);
  const load = () => JSON.parse(raw() || 'null') || empty();
  const save = (state) => storage.setItem(KEY, JSON.stringify(state));
  const listeners = new Set();
  let queue = Promise.resolve();

  /** Simula a ida ao servidor: espera, e falha se o aparelho estiver sem conexão. */
  async function trip() {
    if (latency) await new Promise((r) => setTimeout(r, latency));
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new BookingError('offline');
  }

  /** Uma operação por vez, como um banco transacional. */
  function serial(fn) {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  }

  async function read(fn, { owner = false } = {}) {
    await trip();
    const state = load();
    if (owner && !state.session) throw denied();
    return clone(fn(state));
  }

  function mutate(fn, { owner = true } = {}) {
    return serial(async () => {
      await trip();
      const state = load();
      if (owner && !state.session) throw denied();
      const out = fn(state);
      save(state);
      return clone(out);
    });
  }

  return {
    kind: 'demo',

    transaction: (fn) => serial(async () => {
      await trip();
      for (let attempt = 0; ; attempt++) {
        const before = raw();
        const state = load();
        const plans = [];
        const result = await fn({
          config: async () => clone(state.config),
          service: async (id) => clone(state.services[id] || null),
          day: async (day) => clone(state.days[day] || null),
          booking: async (token) => clone(state.bookings[token] || null),
          write: (plan) => plans.push(plan),
        });
        if (raw() !== before && attempt < 5) continue; // outra aba gravou no meio: refaz
        for (const plan of plans) applyPlan(state, plan);
        save(state);
        return result;
      }
    }),

    getConfig: () => read((s) => s.config),
    putConfig: (settings) => mutate((s) => { s.config = settings; }),

    listServices: ({ activeOnly }) => read((s) => Object.values(s.services).filter((x) => !activeOnly || x.active)),
    putService: (service) => mutate((s) => { s.services[service.id] = service; }),
    removeService: (id) => mutate((s) => { delete s.services[id]; }),

    getDays: (fromDay, toDay) => read((s) => {
      const out = {};
      for (const d of Object.values(s.days)) if (d.day >= fromDay && d.day <= toDay) out[d.day] = d;
      return out;
    }),
    putDays: (creates, updates) => mutate((s) => {
      for (const d of creates) s.days[d.day] = { day: d.day, shut: d.shut, off: d.off, busy: {}, holds: {} };
      for (const d of updates) Object.assign(s.days[d.day], { shut: d.shut, off: d.off });
    }),

    getBooking: (token) => read((s) => s.bookings[token] || null),
    queryBookings: (f) => read((s) => {
      let list = Object.values(s.bookings);
      if (f.status) list = list.filter((b) => b.status === f.status);
      else if (f.fromDay != null) list = list.filter((b) => b.day >= f.fromDay && b.day <= f.toDay);
      else if (f.limit) list = list.sort((a, b) => b.day - a.day).slice(0, f.limit);
      return list;
    }, { owner: true }),
    removeBooking: (b) => mutate((s) => { delete s.bookings[b.token]; }),
    restoreBooking: (b) => mutate((s) => { s.bookings[b.token] = { ...b, rev: 1, pendingSince: null }; }),

    listBlocks: (fromDay) => read((s) => Object.values(s.blocks).filter((b) => b.day >= fromDay), { owner: true }),
    putBlock: (block) => mutate((s) => { s.blocks[block.id] = block; }),
    removeBlock: (id) => mutate((s) => { delete s.blocks[id]; }),

    // ---------- acesso (na demonstração qualquer pessoa entra; não há senha de verdade)
    async signIn() {
      await mutate((s) => { s.session = true; }, { owner: false });
      listeners.forEach((cb) => cb(DEMO_USER));
      return DEMO_USER;
    },
    async signOut() {
      await mutate((s) => { s.session = false; }, { owner: false });
      listeners.forEach((cb) => cb(null));
    },
    async sendReset() {
      throw new BookingError('demo_only');
    },
    async onAuth(cb) {
      listeners.add(cb);
      cb(load().session ? DEMO_USER : null);
      return () => listeners.delete(cb);
    },
    currentUser: async () => (load().session ? DEMO_USER : null),
    isOwner: async () => load().session === true,
  };
}

export function createDemoStore({ storage, now, latency = 0 }) {
  return createStore(demoBackend({ storage, latency }), { now });
}
