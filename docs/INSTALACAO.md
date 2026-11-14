# Instalação e publicação

Cada negócio tem **sua própria instalação**: um projeto Firebase próprio, dados separados, contas
separadas. Nada desta instalação é compartilhado com outras. O passo a passo leva cerca de 30 minutos.

> Este guia foi escrito e testado contra o **emulador** do Firebase. A publicação em um projeto real
> **ainda não foi feita** nesta entrega (depende de uma conta Google do negócio). Siga os passos e
> confira o checklist do final antes de divulgar o link.

## O que você precisa

- Uma conta Google para o negócio (de preferência criada para isso, não a pessoal do instalador).
- Node.js 20 ou mais novo no computador de quem instala.
- Este repositório.

## 1. Testar localmente (sem nenhuma conta)

```bash
npm install
```

```bash
npm run dev
```

Abra `http://127.0.0.1:5173/` (cliente) e `http://127.0.0.1:5173/painel.html` (painel). Isso roda a
**demonstração**: dados fictícios guardados só no navegador. Para recomeçar a demonstração, use
"Recomeçar" na faixa preta do painel.

## 2. Criar o projeto Firebase

1. Acesse <https://console.firebase.google.com> com a conta do negócio → **Adicionar projeto**.
   Nome sugerido: `agenda-nome-do-negocio`. O Google Analytics não é necessário.
2. O projeto começa no plano **Spark (sem custo)**. Não é preciso cadastrar cartão para esta versão.
3. **Firestore Database** → Criar banco de dados → modo de produção → local `southamerica-east1`
   (São Paulo). A região não pode ser trocada depois.
4. **Authentication** → Começar → Método de login → ative **E-mail/senha** (sem "link por e-mail").
5. **Authentication → Configurações → Ações do usuário**: deixe desativada a criação de contas por
   qualquer pessoa, se a opção estiver disponível no seu console. Mesmo que fique ativa, uma conta criada
   por um estranho **não** ganha acesso: só contas registradas em `owners` são administradoras.
6. **Authentication → Modelos** → idioma **Português (Brasil)** para o e-mail de redefinição de senha.

## 3. Ligar o aplicativo ao projeto

1. No console: ⚙ **Configurações do projeto** → Seus aplicativos → ícone **Web** (`</>`) → registre o
   app (sem Hosting nesta tela). Copie os valores de `apiKey`, `authDomain`, `projectId` e `appId`.
2. Edite `public/config.js`:

```js
export default {
  mode: 'firebase',
  firebase: {
    apiKey: 'AIza…',
    authDomain: 'agenda-nome-do-negocio.firebaseapp.com',
    projectId: 'agenda-nome-do-negocio',
    appId: '1:…:web:…',
  },
  appCheckSiteKey: '',
  emulators: null,
};
```

Esses valores **não são segredos** — eles aparecem no navegador de qualquer visitante. Quem protege os
dados são as regras do Firestore. **Nunca** coloque em `config.js` senha, chave de conta de serviço ou
token de API. O arquivo `.env.example` lista os mesmos valores para referência.

3. Em **Authentication → Configurações → Domínios autorizados**, confirme que o domínio de hospedagem
   (`agenda-nome-do-negocio.web.app`) está na lista (vem por padrão).

## 4. Publicar regras e site

```bash
npx firebase login
```

```bash
npx firebase use --add
```

(escolha o projeto e dê o apelido `default`)

```bash
npm run deploy
```

Isso publica `firestore.rules` e a pasta `public/`. O link fica em
`https://agenda-nome-do-negocio.web.app` — não é preciso domínio próprio.

## 5. Criar a conta da proprietária (sem senha no código)

1. Console → **Authentication → Usuários → Adicionar usuário**: e-mail da profissional e uma senha
   provisória forte. Combine que ela troque a senha usando "Esqueci minha senha" no primeiro acesso.
2. Copie o **UID** do usuário criado (coluna "UID do usuário").
3. Console → **Firestore → Iniciar coleção** → ID da coleção `owners` → ID do documento: **cole o UID**
   → campo `role` (string) = `owner` → Salvar.

Só quem tem um documento em `owners` administra a agenda, e **ninguém consegue criar esse documento pelo
aplicativo** (as regras proíbem). Se a pessoa entrar antes desse passo, o painel mostra "Conta sem
acesso" e o código da conta para enviar ao instalador.

## 6. Primeira configuração

A profissional abre `https://…web.app/painel.html`, entra com e-mail e senha e vê "Vamos configurar sua
agenda": nome do negócio, WhatsApp e tipo de negócio (manicure, barbearia, cabeleireiro, sobrancelhas,
estética). Os serviços sugeridos podem ser ajustados em **Ajustes**. Para o piloto da manicure, veja
[PILOTO-MANICURE.md](PILOTO-MANICURE.md).

No celular, "Adicionar à tela de início" instala o painel como aplicativo.

## 7. App Check (opcional, recomendado)

Dificulta que alguém chame o banco fora do site. **Não substitui as regras**.

1. Crie uma chave **reCAPTCHA v3** em <https://www.google.com/recaptcha/admin> para o domínio `…web.app`.
2. Console → **App Check** → registre o app web com o provedor reCAPTCHA v3 e a **chave secreta** (fica
   só no console, nunca no repositório).
3. Coloque a **chave do site** (pública) em `appCheckSiteKey` no `config.js` e publique de novo.
4. Acompanhe as métricas por alguns dias **antes** de ativar a aplicação obrigatória ("Enforce") para o
   Firestore — se ativar antes, visitantes com navegadores antigos podem ser bloqueados.

Não testado nesta entrega (depende de chave real).

## 8. Checklist antes de divulgar o link

- [ ] `public/config.js` com `mode: 'firebase'` e os dados do projeto certo.
- [ ] `npm run deploy` concluído sem erro.
- [ ] Documento `owners/{UID}` criado; a profissional entra e vê o painel.
- [ ] Em uma janela anônima do celular: reservar, abrir o link da reserva, cancelar.
- [ ] No console do Firestore, conferir que a reserva e o documento do dia foram gravados.
- [ ] Testar "Esqueci minha senha" e conferir a chegada do e-mail (inclusive no spam).
- [ ] Exportar os dados uma vez em Ajustes e guardar o arquivo.
- [ ] Alerta de orçamento (se um dia mudar para o plano Blaze — ver [CUSTOS.md](CUSTOS.md)).

## Outro negócio, mesma base

Repita do passo 2 com um projeto novo. Mude apenas `public/config.js`. Nome, cor, logo, serviços,
horários e regras são configurados pelo painel — nenhum código precisa ser alterado. Para trocar o
nome provisório do produto ("Agenda Base") que aparece no rodapé, edite `public/index.html`,
`public/painel.html` e os arquivos `*.webmanifest`.

## Atualizar uma instalação

1. Atualize o código (`git pull`).
2. Mantenha o seu `public/config.js`.
3. Em `public/sw.js`, troque `VERSION` (ex.: `agenda-base-v2`) para os celulares descartarem a versão
   antiga.
4. `npm test` e depois `npm run deploy`.

## Desenvolvimento com o emulador

Precisa de Java 11+ (o emulador do Firestore roda em Java).

```bash
npm run emulators
```

Em outro terminal, sirva o app apontando para o emulador:

```bash
node scripts/serve.mjs --config tests/e2e-firebase/config.emulador.js
```

A conta e o documento `owners/{uid}` podem ser criados na interface do emulador ou pelos testes.
