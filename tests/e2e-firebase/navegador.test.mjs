// O aplicativo real (SDK empacotado em public/vendor) no navegador, contra Firestore e Auth do emulador,
// com as regras de segurança ligadas. É o mais perto de produção que dá para testar sem um projeto real.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { launch, DESKTOP } from '../e2e/_browser.mjs';

const AUTH = 'http://127.0.0.1:9099';
const PASSWORD = 'senha-de-teste-123';
let app;
let testEnv;
let owner;

/** Lê o banco ignorando as regras (withSecurityRulesDisabled não devolve o valor do callback). */
async function adminRead(fn) {
  let out;
  await testEnv.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); });
  return out;
}

async function signUp(email) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  return (await res.json()).localId;
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-agenda',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await testEnv.clearFirestore();
  app = await launch({ config: fileURLToPath(new URL('./config.emulador.js', import.meta.url)) });
  owner = { email: `dona-${Date.now()}@exemplo.test` };
  owner.uid = await signUp(owner.email);
  // o instalador libera a conta criando owners/{uid} no console
  await testEnv.withSecurityRulesDisabled((ctx) => ctx.firestore().doc(`owners/${owner.uid}`).set({ role: 'owner' }));
});
after(async () => { await app.close(); await testEnv.cleanup(); });

const open = (path = '/', viewport) => app.open({ path, now: null, viewport });

async function login(page, email = owner.email, password = PASSWORD) {
  await page.getByRole('heading', { name: 'Entrar no painel' }).waitFor();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function untilDetails(page, name) {
  await page.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  await page.locator('button.prow').first().click();
  await page.locator('.slot').first().waitFor();
  // um dia com folga de sobra: o terceiro dia aberto da faixa
  await page.locator('button.leaf:not([data-off])').nth(2).click();
  const slot = page.locator('.slot').nth(3);
  const label = (await slot.textContent()).trim();
  await slot.click();
  await page.getByLabel('Seu nome').fill(name);
  await page.getByLabel(/Telefone/).fill('92991234567');
  return label;
}

test('antes da configuração, o link público avisa que ainda não está pronto e nada é exposto', async () => {
  const { page, context } = await open();
  await page.getByRole('heading', { name: 'Este link ainda não está pronto' }).waitFor();
  await context.close();
});

test('senha errada é recusada; conta que não é proprietária não entra no painel', async () => {
  const { page, context } = await open('/painel.html');
  await login(page, owner.email, 'senha-errada');
  await page.getByText('E-mail ou senha incorretos.').waitFor();
  const strangerEmail = `visitante-${Date.now()}@exemplo.test`;
  const uid = await signUp(strangerEmail);
  await login(page, strangerEmail);
  await page.getByRole('heading', { name: 'Conta sem acesso' }).waitFor();
  assert.equal(await page.getByLabel('Código da conta').inputValue(), uid);
  assert.equal(await page.getByRole('navigation').count(), 0);
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByRole('heading', { name: 'Entrar no painel' }).waitFor();
  await context.close();
});

test('recuperação de senha: pedido aceito sem revelar se o e-mail existe', async () => {
  const { page, context } = await open('/painel.html');
  await page.getByRole('heading', { name: 'Entrar no painel' }).waitFor();
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await page.getByText('Digite seu e-mail acima').waitFor();
  await page.getByLabel('E-mail').fill(owner.email);
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await page.getByText('Se houver uma conta com este e-mail, enviamos um link').waitFor();
  const codes = await (await fetch(`${AUTH}/emulator/v1/projects/demo-agenda/oobCodes`)).json();
  assert.ok(codes.oobCodes.some((c) => c.email === owner.email && c.requestType === 'PASSWORD_RESET'));
  await page.getByLabel('E-mail').fill('ninguem@exemplo.test');
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await page.getByText('Se houver uma conta com este e-mail, enviamos um link').waitFor();
  await context.close();
});

test('proprietária entra, faz a primeira configuração e o link público passa a funcionar', async () => {
  const { page, context, errors } = await open('/painel.html');
  await login(page);
  await page.getByRole('heading', { name: 'Vamos configurar sua agenda' }).waitFor();
  await page.getByLabel('Nome do negócio').fill('Studio Teste (fictício)');
  await page.getByLabel('WhatsApp do negócio').fill('92 90000-0000');
  await page.getByRole('button', { name: 'Criar minha agenda' }).click();
  await page.getByText('Nenhum atendimento hoje').waitFor({ timeout: 60000 });
  // a sessão continua depois de recarregar
  await page.reload();
  await page.getByText('Nenhum atendimento hoje').waitFor();

  const client = await context.newPage();
  await client.goto(app.url + '/');
  await client.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  assert.match(await client.locator('.band-name').textContent(), /Studio Teste/);
  assert.equal(await client.locator('button.prow').count(), 5);
  assert.deepEqual(errors, []);
  await context.close();
});

test('reserva pelo link é gravada no servidor, abre em outro navegador e aparece no painel', async () => {
  const { page, context, errors } = await open();
  const time = await untilDetails(page, 'Maria do Navegador');
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();
  const link = page.url();
  assert.match(link, /#\/r\/[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(errors, []);
  await context.close();

  const other = await open(link.replace(app.url, ''));
  await other.page.getByRole('heading', { name: 'Seu horário está confirmado' }).waitFor();
  await other.page.getByText('Maria do Navegador').waitFor();
  await other.page.getByText(new RegExp(`às ${time}`)).first().waitFor();
  await other.context.close();

  const admin = await open('/painel.html#/clientes', DESKTOP);
  await login(admin.page);
  await admin.page.getByRole('button', { name: /Maria do Navegador/ }).waitFor();
  await admin.context.close();
});

test('dois navegadores confirmam o mesmo horário ao mesmo tempo: um reserva, o outro é avisado', async () => {
  const a = await open();
  const b = await open();
  const [ta, tb] = [await untilDetails(a.page, 'Corrida A'), await untilDetails(b.page, 'Corrida B')];
  assert.equal(ta, tb);
  await Promise.all([
    a.page.getByRole('button', { name: 'Confirmar agendamento' }).click(),
    b.page.getByRole('button', { name: 'Confirmar agendamento' }).click(),
  ]);
  const outcome = (page) => Promise.race([
    page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor().then(() => 'ok'),
    page.getByRole('alert').filter({ hasText: 'acabou de ser reservado por outra pessoa' }).waitFor().then(() => 'taken'),
  ]);
  const results = [await outcome(a.page), await outcome(b.page)].sort();
  assert.deepEqual(results, ['ok', 'taken']);
  const loser = (await a.page.getByRole('heading', { name: 'Agendamento confirmado' }).count()) ? b.page : a.page;
  await loser.locator('.slot').first().waitFor();
  assert.ok(!(await loser.locator('.slot').allTextContents()).includes(ta), 'o horário disputado não é mais oferecido');
  const stored = await adminRead(async (db) => (await db.collection('bookings').get()).docs.map((d) => d.data().customer.name));
  assert.equal(stored.filter((n) => n.startsWith('Corrida')).length, 1);
  await a.context.close();
  await b.context.close();
});

test('sem conexão com o servidor não há confirmação; ao voltar, a reserva é feita', async () => {
  const { page, context } = await open();
  await untilDetails(page, 'Sem Sinal');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('alert').filter({ hasText: 'Seu horário ainda NÃO foi reservado' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Agendamento confirmado' }).count(), 0);
  const count = () => adminRead(async (db) => (await db.collection('bookings').where('customer.name', '==', 'Sem Sinal').get()).size);
  assert.equal(await count(), 0);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();
  assert.equal(await count(), 1);
  await context.close();
});

test('painel real: aprovar pelo navegador no modo aprovação', async () => {
  await testEnv.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('config/public').update({ 'rules.mode': 'approval' }));
  const client = await open();
  await untilDetails(client.page, 'Pedido Pendente');
  await client.page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await client.page.getByRole('heading', { name: 'Solicitação enviada' }).waitFor();
  const link = client.page.url();

  const admin = await open('/painel.html');
  await login(admin.page);
  const box = admin.page.getByRole('region', { name: 'Aguardando sua aprovação' });
  await box.getByText('Pedido Pendente').waitFor();
  await box.getByRole('button', { name: 'Aprovar' }).click();
  await admin.page.getByText('Aprovado. Avise a cliente:').waitFor();
  await admin.context.close();

  await client.page.goto(link);
  await client.page.reload();
  await client.page.getByRole('heading', { name: 'Seu horário está confirmado' }).waitFor();
  await client.context.close();
  await testEnv.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('config/public').update({ 'rules.mode': 'auto' }));
});
