// Ambiente de teste contra o Emulator Suite (Firestore + Auth). Dados fictícios.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import * as fs from 'firebase/firestore/lite';
import * as authSdk from 'firebase/auth';
import { createFirebaseStore } from '../../public/js/data/firebase.js';
import { addDays } from '../../public/js/core/time.js';
import { todayOf } from '../../public/js/core/schedule.js';

export const PROJECT = 'demo-agenda';
export const OFFSET = -240;
export const HOUR = 3600000;
const FS_HOST = '127.0.0.1';
const emulators = { firestore: { host: FS_HOST, port: 8080 }, auth: 'http://127.0.0.1:9099' };

let seq = 0;

/** Dia inteiro aberto em todos os dias da semana: os testes não dependem da hora em que rodam. */
export function testSettings(over = {}) {
  const allDay = { open: true, periods: [{ s: 0, e: 1440 }] };
  const base = {
    business: { name: 'Studio Teste (fictício)', phone: '92999990000', address: 'Rua Fictícia, 1', accent: '#8b2f4b', logo: '', tagline: '' },
    privacy: { text: 'Aviso de teste.' },
    timezone: 'America/Manaus', utcOffsetMin: OFFSET,
    week: { 0: allDay, 1: allDay, 2: allDay, 3: allDay, 4: allDay, 5: allDay, 6: allDay },
    exceptions: {},
    rules: { mode: 'auto', minAdvanceMin: 120, maxDays: 30, slotStepMin: 30, cancelLimitMin: 720, approvalMin: 720, paused: false },
  };
  return { ...base, ...over, rules: { ...base.rules, ...(over.rules || {}) } };
}

export const service = (over = {}) => ({ id: 'mao', name: 'Mão', description: '', price: 3500, duration: 45, buffer: 10, active: true, order: 1, ...over });
export const customer = (n = 1) => ({ name: `Cliente Fictícia ${n}`, phone: `9299100${String(1000 + n)}` });

export async function makeEnv() {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: FS_HOST, port: 8080 },
  });
  await testEnv.clearFirestore();
  const apps = [];

  function newClient() {
    const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key', authDomain: 'localhost' }, `c${++seq}`);
    apps.push(app);
    const store = createFirebaseStore({ app, fs, loadAuth: async () => authSdk, emulators });
    return { app, store, db: fs.getFirestore(app) };
  }

  /** Cria uma conta no emulador e a registra em owners/, como o instalador faz no console. */
  async function newOwner() {
    const c = newClient();
    const email = `dona${seq}-${Math.random().toString(36).slice(2, 8)}@exemplo.test`;
    await c.store.currentUser(); // inicializa o Auth já apontando para o emulador
    const auth = authSdk.getAuth(c.app);
    const cred = await authSdk.createUserWithEmailAndPassword(auth, email, 'senha-de-teste-123');
    await testEnv.withSecurityRulesDisabled((ctx) => ctx.firestore().doc(`owners/${cred.user.uid}`).set({ role: 'owner' }));
    return { ...c, email, uid: cred.user.uid };
  }

  /** Conta autenticada que NÃO é proprietária (alguém que se cadastrou por conta própria). */
  async function newStranger() {
    const c = newClient();
    await c.store.currentUser();
    const auth = authSdk.getAuth(c.app);
    await authSdk.createUserWithEmailAndPassword(auth, `intrusa${seq}-${Math.random().toString(36).slice(2, 8)}@exemplo.test`, 'senha-de-teste-123');
    return c;
  }

  /** Instalação pronta: configuração, serviços e dias materializados. */
  async function install(settingsOver = {}, services = [service(), service({ id: 'gel', name: 'Alongamento em gel', price: 12000, duration: 90, buffer: 10, order: 2 })]) {
    const owner = await newOwner();
    await owner.store.saveSettings(testSettings(settingsOver));
    for (const s of services) await owner.store.saveService(s);
    await owner.store.syncDays();
    return owner;
  }

  const admin = (fn) => testEnv.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
  const today = () => todayOf(Date.now(), OFFSET);
  const dayAhead = (n) => addDays(today(), n);

  async function cleanup() {
    await Promise.all(apps.map((a) => deleteApp(a)));
    await testEnv.cleanup();
  }

  return { testEnv, newClient, newOwner, newStranger, install, admin, today, dayAhead, cleanup, fs };
}

export async function rejectsWith(promise, code) {
  try {
    await promise;
  } catch (e) {
    if (e.code !== code) throw new Error(`esperava o código "${code}", veio "${e.code}": ${e.message}`);
    return e;
  }
  throw new Error(`esperava falha com o código "${code}", mas a operação foi aceita`);
}

/** A operação precisa ser negada pelas regras do servidor. */
export async function denied(promise) {
  try {
    await promise;
  } catch (e) {
    if (e.code === 'permission-denied') return;
    throw new Error(`esperava permission-denied, veio "${e.code}": ${e.message}`);
  }
  throw new Error('esperava permission-denied, mas a operação foi aceita');
}
