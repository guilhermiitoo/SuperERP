// Configuração desta instalação. É o único arquivo que muda de um negócio para outro.
//
// mode: 'demo'     → demonstração com dados fictícios guardados no navegador (padrão do repositório).
// mode: 'firebase' → produção. Preencha `firebase` com os dados do SEU projeto
//                    (Console do Firebase → Configurações do projeto → Seus aplicativos → Web).
//
// Estes valores não são segredos: identificam o projeto e ficam visíveis no navegador de qualquer
// visitante. A proteção dos dados está em firestore.rules. Nunca coloque aqui senha, chave de conta
// de serviço ou token de API. Veja docs/INSTALACAO.md.
export default {
  mode: 'demo',

  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
  },

  // Opcional: chave pública do reCAPTCHA v3 para o Firebase App Check (docs/INSTALACAO.md).
  appCheckSiteKey: '',

  // Somente desenvolvimento: aponta para o Emulator Suite local.
  emulators: null,
};
