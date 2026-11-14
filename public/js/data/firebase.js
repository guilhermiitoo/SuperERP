// Backend Firebase: Firestore (SDK Lite, sem cache local) e Authentication.
// O SDK é injetado para que o mesmo código rode no navegador (public/vendor) e nos testes (npm).

import { BookingError } from '../core/booking.js';
import { AGENDA_ID } from '../core/constants.js';
import { createStore } from './store.js';

const SERVER = Object.freeze({ $server: true });
const DELETE = Object.freeze({ $delete: true });
const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const dayPath = (day) => `agendas/${AGENDA_ID}/days/${day}`;

function bookingData(b, { keepCreatedAt = false } = {}) {
  return {
    bid: b.bid, rev: b.rev, agenda: b.agenda, status: b.status, source: b.source, mode: b.mode,
    day: b.day, start: b.start, n: b.n, startAt: new Date(b.startAt),
    service: b.service, customer: b.customer,
    approvalMin: b.approvalMin, cancelLimitMin: b.cancelLimitMin,
    createdAt: keepCreatedAt ? new Date(b.createdAt) : SERVER,
    updatedAt: SERVER,
    pendingSince: b.pendingSince == null ? null : SERVER,
    endedBy: b.endedBy ?? null,
  };
}

/**
 * Traduz um plano do núcleo em gravações do Firestore.
 * Marcadores: {$server:true} = horário do servidor; {$delete:true} = apagar campo.
 */
export function planWrites(plan) {
  const writes = [];
  const b = plan.booking;
  if (b && b.rev === 1) {
    writes.push({ kind: 'set', path: `bookings/${b.token}`, data: bookingData(b, plan) });
    writes.push({ kind: 'set', path: `locks/${b.bid}`, data: { token: b.token } });
  } else if (b) {
    const data = {
      status: b.status, rev: b.rev, day: b.day, start: b.start, n: b.n, startAt: new Date(b.startAt),
      customer: b.customer, endedBy: b.endedBy ?? null, updatedAt: SERVER,
    };
    // pendingSince só é regravado quando muda: zerado, ou reiniciado nesta operação
    if (b.pendingSince == null) data.pendingSince = null;
    else if (b.pendingSince === b.updatedAt) data.pendingSince = SERVER;
    writes.push({ kind: 'update', path: `bookings/${b.token}`, data });
  }
  for (const op of plan.dayOps) {
    const data = { op: op.op };
    for (const k of op.add) data[`busy.${k}`] = true;
    for (const k of op.remove) data[`busy.${k}`] = DELETE;
    if (op.holdDel) data[`holds.${op.holdDel}`] = DELETE;
    if (op.holdSet) data[`holds.${op.holdSet.bid}`] = { s: op.holdSet.hold.s, n: op.holdSet.hold.n, a: op.holdSet.hold.a, c: SERVER };
    writes.push({ kind: 'update', path: dayPath(op.day), data });
  }
  return writes;
}

function materialize(fs, value) {
  if (value === null || typeof value !== 'object') return value;
  if (value.$server) return fs.serverTimestamp();
  if (value.$delete) return fs.deleteField();
  if (value instanceof Date) return fs.Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map((v) => materialize(fs, v));
  if (Object.getPrototypeOf(value) !== Object.prototype) return value; // Timestamp e outros tipos do SDK
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = materialize(fs, v);
  return out;
}

function applyWrites(target, db, fs, writes) {
  for (const w of writes) {
    const ref = fs.doc(db, w.path);
    if (w.kind === 'set') target.set(ref, materialize(fs, w.data));
    else target.update(ref, materialize(fs, w.data));
  }
}

/** Grava um conjunto de gravações em um único lote atômico (usado também pelos testes de ataque). */
export async function commitWrites(db, fs, writes) {
  const batch = fs.writeBatch(db);
  applyWrites(batch, db, fs, writes);
  await batch.commit();
}

const millis = (t) => (t == null ? null : t.toMillis());

function bookingFrom(snap) {
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    ...d, token: snap.id,
    startAt: millis(d.startAt), createdAt: millis(d.createdAt), updatedAt: millis(d.updatedAt), pendingSince: millis(d.pendingSince),
  };
}

function dayFrom(snap) {
  if (!snap.exists()) return null;
  const d = snap.data();
  const holds = {};
  for (const [bid, h] of Object.entries(d.holds || {})) holds[bid] = { ...h, c: millis(h.c) };
  return { day: d.day, shut: d.shut, off: d.off || {}, busy: d.busy || {}, holds };
}

function configFrom(snap) {
  if (!snap.exists()) return null;
  const { updatedAt: _u, ...rest } = snap.data();
  return rest;
}

const serviceFrom = (snap) => (snap.exists() ? { id: snap.id, ...snap.data() } : null);

function isOfflineError(e) {
  if (e instanceof TypeError) return true; // fetch falhou
  const code = e?.code || '';
  if (code === 'unavailable' || code === 'deadline-exceeded' || code.endsWith('network-request-failed')) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false && !(e instanceof BookingError);
}

async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BookingError || !isOfflineError(e)) throw e;
    throw new BookingError('offline');
  }
}

export function firebaseBackend({ app, fs, loadAuth, emulators }) {
  const db = fs.getFirestore(app);
  if (emulators?.firestore) fs.connectFirestoreEmulator(db, emulators.firestore.host, emulators.firestore.port);
  const ref = (path) => fs.doc(db, path);
  const col = (path) => fs.collection(db, path);

  let authReady;
  function auth() {
    authReady ||= (async () => {
      const sdk = await loadAuth();
      const instance = sdk.getAuth(app);
      if (emulators?.auth) sdk.connectAuthEmulator(instance, emulators.auth, { disableWarnings: true });
      await instance.authStateReady();
      return { sdk, instance };
    })();
    return authReady;
  }
  const userOf = (u) => (u ? { uid: u.uid, email: u.email } : null);

  async function chunked(items, size, fn) {
    for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
  }

  return {
    kind: 'firebase',

    transaction: (fn) => guard(() => fs.runTransaction(db, (tx) => fn({
      config: async () => configFrom(await tx.get(ref('config/public'))),
      service: async (id) => (KEY.test(id || '') ? serviceFrom(await tx.get(ref(`services/${id}`))) : null),
      day: async (day) => dayFrom(await tx.get(ref(dayPath(day)))),
      booking: async (token) => (KEY.test(token || '') ? bookingFrom(await tx.get(ref(`bookings/${token}`))) : null),
      write: (plan) => applyWrites(tx, db, fs, planWrites(plan)),
    }))),

    getConfig: () => guard(async () => configFrom(await fs.getDoc(ref('config/public')))),
    putConfig: (settings) => guard(() => fs.setDoc(ref('config/public'), { ...settings, updatedAt: fs.serverTimestamp() })),

    listServices: ({ activeOnly }) => guard(async () => {
      const q = activeOnly ? fs.query(col('services'), fs.where('active', '==', true)) : col('services');
      return (await fs.getDocs(q)).docs.map(serviceFrom);
    }),
    putService: ({ id, ...data }) => guard(() => fs.setDoc(ref(`services/${id}`), data)),
    removeService: (id) => guard(() => fs.deleteDoc(ref(`services/${id}`))),

    getDays: (fromDay, toDay) => guard(async () => {
      const q = fs.query(col(`agendas/${AGENDA_ID}/days`), fs.where('day', '>=', fromDay), fs.where('day', '<=', toDay));
      const out = {};
      for (const snap of (await fs.getDocs(q)).docs) out[snap.data().day] = dayFrom(snap);
      return out;
    }),

    /** Cria dias novos e atualiza a parte da proprietária (shut/off) dos existentes. Nunca toca em reservas. */
    putDays: (creates, updates) => guard(async () => {
      const ops = [
        ...creates.map((d) => ({ create: true, d })),
        ...updates.map((d) => ({ create: false, d })),
      ];
      await chunked(ops, 20, async (part) => {
        const batch = fs.writeBatch(db);
        for (const { create, d } of part) {
          if (create) batch.set(ref(dayPath(d.day)), { day: d.day, shut: d.shut, off: d.off, busy: {}, holds: {}, op: null, v: 1 });
          else batch.update(ref(dayPath(d.day)), { shut: d.shut, off: d.off, v: fs.increment(1) });
        }
        await batch.commit();
      });
    }),

    getBooking: (token) => guard(async () => (KEY.test(token || '') ? bookingFrom(await fs.getDoc(ref(`bookings/${token}`))) : null)),

    queryBookings: (f) => guard(async () => {
      let q = col('bookings');
      if (f.status) q = fs.query(q, fs.where('status', '==', f.status));
      else if (f.fromDay != null) q = fs.query(q, fs.where('day', '>=', f.fromDay), fs.where('day', '<=', f.toDay));
      else if (f.limit) q = fs.query(q, fs.orderBy('day', 'desc'), fs.limit(f.limit));
      return (await fs.getDocs(q)).docs.map(bookingFrom);
    }),

    removeBooking: (b) => guard(async () => {
      const batch = fs.writeBatch(db);
      batch.delete(ref(`bookings/${b.token}`));
      batch.delete(ref(`locks/${b.bid}`));
      await batch.commit();
    }),

    /** Histórico vindo de uma cópia de segurança: não ocupa agenda. */
    restoreBooking: (b) => guard(() => fs.setDoc(
      ref(`bookings/${b.token}`),
      materialize(fs, { ...bookingData({ ...b, rev: 1 }, { keepCreatedAt: true }), pendingSince: null }),
    )),

    listBlocks: (fromDay) => guard(async () => {
      const q = fs.query(col('blocks'), fs.where('day', '>=', fromDay));
      return (await fs.getDocs(q)).docs.map((s) => ({ id: s.id, ...s.data() }));
    }),
    putBlock: ({ id, ...data }) => guard(() => fs.setDoc(ref(`blocks/${id}`), data)),
    removeBlock: (id) => guard(() => fs.deleteDoc(ref(`blocks/${id}`))),

    // ---------- acesso administrativo
    async signIn(email, password) {
      const { sdk, instance } = await auth();
      try {
        return userOf((await sdk.signInWithEmailAndPassword(instance, String(email).trim(), password)).user);
      } catch (e) {
        if (isOfflineError(e)) throw new BookingError('offline');
        if (e.code === 'auth/too-many-requests') throw new BookingError('auth_throttled');
        throw new BookingError('auth_invalid');
      }
    },
    async signOut() {
      const { sdk, instance } = await auth();
      await sdk.signOut(instance);
    },
    /** Pede o e-mail de redefinição. Não revela se o endereço tem conta. */
    async sendReset(email) {
      const { sdk, instance } = await auth();
      try {
        await sdk.sendPasswordResetEmail(instance, String(email).trim());
      } catch (e) {
        if (isOfflineError(e)) throw new BookingError('offline');
        if (e.code === 'auth/too-many-requests') throw new BookingError('auth_throttled');
        if (e.code === 'auth/invalid-email' || e.code === 'auth/missing-email') throw new BookingError('auth_invalid');
      }
    },
    async onAuth(cb) {
      const { sdk, instance } = await auth();
      return sdk.onAuthStateChanged(instance, (u) => cb(userOf(u)));
    },
    async currentUser() {
      return userOf((await auth()).instance.currentUser);
    },
    isOwner: () => guard(async () => {
      const u = (await auth()).instance.currentUser;
      return u ? (await fs.getDoc(ref(`owners/${u.uid}`))).exists() : false;
    }),
  };
}

export function createFirebaseStore({ app, fs, loadAuth, emulators, now }) {
  return createStore(firebaseBackend({ app, fs, loadAuth, emulators }), { now });
}
