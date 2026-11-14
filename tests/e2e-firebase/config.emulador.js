// Configuração usada só nos testes: aponta o aplicativo para o Emulator Suite local.
export default {
  mode: 'firebase',
  firebase: { apiKey: 'fake-api-key', authDomain: 'localhost', projectId: 'demo-agenda', appId: 'demo' },
  appCheckSiteKey: '',
  emulators: { firestore: { host: '127.0.0.1', port: 8080 }, auth: 'http://127.0.0.1:9099' },
};
