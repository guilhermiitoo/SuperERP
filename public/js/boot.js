// Monta a camada de dados conforme public/config.js.
import config from '../config.js';

export const isDemo = config.mode !== 'firebase';

function safeStorage() {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return localStorage;
  } catch {
    return null; // navegador embutido ou modo privado sem armazenamento
  }
}

/** Relógio corrigido pela hora do servidor de hospedagem, para o caso de o aparelho estar com hora errada. */
async function serverClock() {
  try {
    const sent = Date.now();
    const res = await fetch(`./version.json?t=${sent}`, { method: 'HEAD', cache: 'no-store' });
    const date = Date.parse(res.headers.get('date') || '');
    if (Number.isFinite(date)) {
      const offset = date + 500 - (sent + Date.now()) / 2;
      if (Math.abs(offset) > 30000) return () => Date.now() + offset;
    }
  } catch {
    // sem conexão agora: segue com o relógio do aparelho
  }
  return () => Date.now();
}

export async function createAppStore() {
  if (!isDemo) {
    const [{ initializeApp }, fs, { createFirebaseStore }, now] = await Promise.all([
      import('../vendor/firebase/firebase-app.js'),
      import('../vendor/firebase/firebase-firestore-lite.js'),
      import('./data/firebase.js'),
      serverClock(),
    ]);
    const app = initializeApp(config.firebase);
    if (config.appCheckSiteKey) {
      const ac = await import('../vendor/firebase/firebase-app-check.js');
      ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    }
    return createFirebaseStore({
      app, fs, now, emulators: config.emulators,
      loadAuth: () => import('../vendor/firebase/firebase-auth.js'),
    });
  }
  const [{ createDemoStore, memoryStorage }, { seedDemo }] = await Promise.all([
    import('./data/demo.js'), import('./data/demo-seed.js'),
  ]);
  const store = createDemoStore({ storage: safeStorage() || memoryStorage(), latency: 220 });
  await seedDemo(store);
  return store;
}
