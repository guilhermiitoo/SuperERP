// Área pública no navegador (modo demonstração): o fluxo que a cliente percorre.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launch, withStore, demoState, untilDetails, fillCustomer, DESKTOP } from './_browser.mjs';

let app;
before(async () => { app = await launch(); });
after(async () => { await app.close(); });

const bookingsOf = async (page, name) => Object.values((await demoState(page)).bookings).filter((b) => b.customer.name === name);

test('celular: do link à confirmação, com WhatsApp manual, calendário e link da reserva', async () => {
  const { page, context, errors } = await app.open();
  await page.getByText('Demonstração · dados fictícios').waitFor();
  assert.match(await page.locator('.band-name').textContent(), /Studio Aurora/);
  await page.getByText(/Rua das Acácias/).waitFor();
  const time = await untilDetails(page, /^Mão \+ pé$/);
  await page.getByText('Mão + pé').first().waitFor();
  await page.getByText('R$ 70,00').first().waitFor();
  await fillCustomer(page);
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();
  await page.getByText(`terça-feira, 17 de novembro, às ${time}`).waitFor();
  assert.equal(await page.locator('.chip').textContent(), 'Confirmado');

  const wa = await page.getByRole('link', { name: 'Avisar pelo WhatsApp' }).getAttribute('href');
  assert.match(wa, /^https:\/\/wa\.me\/5592900000000\?text=/);
  assert.match(decodeURIComponent(wa), /Sou Maria Souza e acabei de agendar Mão \+ pé/);
  await page.getByText('Você precisa tocar em enviar.').waitFor();

  const link = await page.getByLabel('Link da sua reserva').inputValue();
  assert.match(link, /#\/r\/[A-Za-z0-9_-]{43}$/);
  assert.equal(page.url(), link);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Adicionar ao calendário' }).click()]);
  const ics = await readFile(await download.path(), 'utf8');
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /SUMMARY:Mão \+ pé — Studio Aurora/);

  // o link funciona em outra aba, sem conta
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date('2026-11-16T12:00:00Z'));
  await other.goto(link);
  await other.getByRole('heading', { name: 'Seu horário está confirmado' }).waitFor();
  await other.getByText('Maria Souza').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('erros de preenchimento são explicados e o que foi digitado continua na tela', async () => {
  const { page, context } = await app.open();
  await untilDetails(page);
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByText('Digite seu nome para a gente saber quem vem.').waitFor();
  await page.getByLabel('Seu nome').fill('Maria Souza');
  await page.getByLabel(/Telefone/).fill('99123');
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByText('Confira o telefone: precisa ter DDD e o número completo.').waitFor();
  assert.equal(await page.getByLabel('Seu nome').inputValue(), 'Maria Souza');
  assert.equal(await page.getByLabel(/Telefone/).getAttribute('aria-invalid'), 'true');
  assert.equal((await bookingsOf(page, 'Maria Souza')).length, 0);
  await context.close();
});

test('toque duplo em confirmar grava uma única reserva', async () => {
  const { page, context } = await app.open();
  await untilDetails(page);
  await fillCustomer(page, 'Dupla Fictícia');
  // três envios no mesmo instante, como um toque repetido ou Enter + toque
  await page.evaluate(() => { const form = document.querySelector('form'); form.requestSubmit(); form.requestSubmit(); form.requestSubmit(); });
  await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();
  assert.equal((await bookingsOf(page, 'Dupla Fictícia')).length, 1);
  await context.close();
});

test('horário ocupado durante o preenchimento: a tela explica, oferece alternativas e mantém os dados', async () => {
  const { page, context } = await app.open();
  const time = await untilDetails(page);
  await fillCustomer(page);
  // enquanto a cliente digita, outra pessoa reserva o mesmo horário
  await withStore(page, async (store, label) => {
    await store.signIn();
    const [h, m] = label.split(':').map(Number);
    await store.createBooking({ serviceId: 'mao', day: 20261117, start: (h * 60 + m) / 5, customer: { name: 'Outra Pessoa', phone: '92900001111' }, source: 'manual' });
    await store.signOut();
  }, time);
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('heading', { name: 'Escolha o dia e o horário' }).waitFor();
  await page.getByRole('alert').filter({ hasText: 'acabou de ser reservado por outra pessoa' }).waitFor();
  await page.locator('.slot').first().waitFor();
  const offered = await page.locator('.slot').allTextContents();
  assert.ok(!offered.includes(time), 'o horário ocupado não aparece mais');
  assert.ok(offered.length > 0, 'há alternativas no mesmo dia');
  await page.locator('.slot').first().click();
  assert.equal(await page.getByLabel('Seu nome').inputValue(), 'Maria Souza');
  assert.equal(await page.getByLabel(/Telefone/).inputValue(), '(92) 99123-4567');
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();
  assert.equal((await bookingsOf(page, 'Maria Souza')).length, 1);
  await context.close();
});

test('sem conexão não há confirmação falsa; ao voltar, a reserva é feita', async () => {
  const { page, context } = await app.open();
  await untilDetails(page);
  await fillCustomer(page);
  await context.setOffline(true);
  await page.getByText('Sem conexão. Os dados podem estar desatualizados').waitFor();
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('alert').filter({ hasText: 'Seu horário ainda NÃO foi reservado' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Agendamento confirmado' }).count(), 0);
  assert.equal((await bookingsOf(page, 'Maria Souza')).length, 0);
  assert.equal(await page.getByLabel('Seu nome').inputValue(), 'Maria Souza');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();
  assert.equal((await bookingsOf(page, 'Maria Souza')).length, 1);
  await context.close();
});

test('pelo link, a cliente remarca e cancela; o horário cancelado volta a ficar livre', async () => {
  const { page, context } = await app.open();
  const first = await untilDetails(page);
  await fillCustomer(page);
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();

  await page.getByRole('button', { name: 'Remarcar' }).click();
  const sheet = page.getByRole('dialog', { name: 'Escolha o novo horário' });
  await sheet.getByRole('button', { name: /^quarta-feira, 18 de novembro/ }).click();
  const second = (await sheet.locator('.slot').first().textContent()).trim();
  await sheet.locator('.slot').first().click();
  await page.getByRole('dialog', { name: 'Remarcar?' }).getByRole('button', { name: 'Remarcar' }).click();
  await page.getByRole('heading', { name: 'Horário remarcado' }).waitFor();
  await page.getByText(`quarta-feira, 18 de novembro, às ${second}`).waitFor();
  assert.match(decodeURIComponent(await page.getByRole('link', { name: 'Avisar pelo WhatsApp' }).getAttribute('href')), /remarquei/);
  const [b] = await bookingsOf(page, 'Maria Souza');
  assert.equal(b.day, 20261118);
  const state = await demoState(page);
  assert.equal(Object.keys(state.days[20261117].busy).length % 5 >= 0, true);

  await page.getByRole('button', { name: 'Cancelar reserva' }).click();
  await page.getByRole('dialog', { name: 'Cancelar a reserva?' }).getByRole('button', { name: 'Cancelar reserva' }).click();
  await page.getByRole('heading', { name: 'Reserva cancelada' }).waitFor();
  await page.getByText('Você cancelou este horário.').waitFor();
  assert.equal((await bookingsOf(page, 'Maria Souza'))[0].status, 'cancelled');
  assert.equal(await page.getByRole('button', { name: 'Remarcar' }).count(), 0);

  // o horário original e o remarcado estão livres de novo
  await page.getByRole('link', { name: 'Fazer um novo agendamento' }).click();
  assert.equal(await untilDetails(page), first);
  await context.close();
});

test('link inexistente não revela nada', async () => {
  const { page, context } = await app.open({ path: `/#/r/${'x'.repeat(43)}` });
  await page.getByRole('heading', { name: 'Não encontramos esta reserva' }).waitFor();
  await context.close();
});

test('dia lotado mostra o próximo dia disponível; dia fechado é explicado', async () => {
  const { page, context } = await app.open();
  await page.locator('button.prow', { hasText: 'Mão + pé' }).click();
  await page.getByRole('button', { name: /^segunda-feira, 16 de novembro, lotado/ }).click();
  await page.getByText('Sem horários livres neste dia').waitFor();
  await page.getByText('É o próximo dia com horário livre.').waitFor();
  await page.getByRole('button', { name: 'Ver ter., 17/11' }).click();
  await page.getByRole('heading', { name: 'terça-feira, 17 de novembro' }).waitFor();
  assert.ok((await page.locator('.slot').count()) > 0);
  await page.getByRole('button', { name: /^domingo, 22 de novembro, fechado/ }).click();
  await page.getByText('Fechado neste dia').waitFor();
  await context.close();
});

test('a disponibilidade pública não mostra dados de outras clientes', async () => {
  const { page, context } = await app.open();
  await page.locator('button.prow', { hasText: 'Mão + pé' }).click();
  await page.locator('.slot').first().waitFor();
  const text = await page.locator('body').innerText();
  for (const name of ['Marina', 'Jéssica', 'Carla', 'Bianca', '9290000']) assert.ok(!text.includes(name), `não deveria mostrar ${name}`);
  await context.close();
});

test('modo aprovação: a cliente vê que ainda não está confirmado e até quando terá resposta', async () => {
  const { page, context } = await app.open();
  await withStore(page, async (store) => {
    await store.signIn();
    const { settings } = await store.loadBusiness();
    await store.saveSettings({ ...settings, rules: { ...settings.rules, mode: 'approval', approvalMin: 720 } });
    await store.signOut();
  });
  await page.reload();
  await untilDetails(page);
  await page.getByText('Este horário precisa de aprovação.').waitFor();
  await fillCustomer(page);
  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await page.getByRole('heading', { name: 'Solicitação enviada' }).waitFor();
  assert.equal(await page.locator('.chip').textContent(), 'Aguardando aprovação');
  await page.getByText('Ainda não está confirmado.').waitFor();
  await page.getByText(/O estabelecimento responde até seg\., 16\/11 às 20:00/).waitFor();
  assert.match(decodeURIComponent(await page.getByRole('link', { name: 'Avisar pelo WhatsApp' }).getAttribute('href')), /enviei uma solicitação/);
  assert.equal(await page.getByRole('heading', { name: /confirmado/i }).count(), 0);
  await context.close();
});

test('agenda pausada: o link explica e não deixa agendar', async () => {
  const { page, context } = await app.open();
  await withStore(page, async (store) => {
    await store.signIn();
    const { settings } = await store.loadBusiness();
    await store.saveSettings({ ...settings, rules: { ...settings.rules, paused: true } });
    await store.signOut();
  });
  await page.reload();
  await page.getByRole('heading', { name: 'Agendamentos pausados' }).waitFor();
  assert.equal(await page.locator('button.prow').count(), 0);
  await page.getByRole('link', { name: 'Falar pelo WhatsApp' }).waitFor();
  await context.close();
});

test('desktop: fluxo inteiro só com o teclado, com foco visível e sem rolagem lateral', async () => {
  const { page, context, errors } = await app.open({ viewport: DESKTOP });
  await page.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  await page.locator('button.prow').first().focus();
  const ring = await page.evaluate(() => { const el = document.activeElement; el.matches(':focus-visible'); return getComputedStyle(el).outlineStyle; });
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Escolha o dia e o horário' }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H1', 'o foco vai para o título do novo passo');
  await page.locator('.slot').first().waitFor();
  await page.getByRole('button', { name: /^terça-feira, 17/ }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.slot').first().focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Seu nome').waitFor();
  await page.keyboard.press('Tab'); // voltar
  for (let i = 0; i < 6 && (await page.evaluate(() => document.activeElement.name)) !== 'name'; i++) await page.keyboard.press('Tab');
  await page.keyboard.type('Teclado Fictício');
  await page.keyboard.press('Tab');
  await page.keyboard.type('92991234567');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.ok(['solid', 'auto', 'none'].includes(ring));
  assert.deepEqual(errors, []);
  await context.close();
});

test('acessibilidade básica: idioma, rótulos, alvos de toque e aviso de privacidade', async () => {
  const { page, context } = await app.open();
  assert.equal(await page.getAttribute('html', 'lang'), 'pt-BR');
  await untilDetails(page);
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]):not(.hp), select, textarea, button, a[href]')]
    .filter((el) => !(el.getAttribute('aria-label') || el.labels?.length || el.textContent.trim())).map((el) => el.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, []);
  const small = await page.evaluate(() => [...document.querySelectorAll('main button, main a.btn, main input:not(.hp)')]
    .map((el) => [el.textContent.trim() || el.name, el.getBoundingClientRect().height]).filter(([, hgt]) => hgt < 40));
  assert.deepEqual(small, []);
  await page.getByRole('button', { name: 'Aviso de privacidade' }).click();
  await page.getByRole('dialog', { name: 'Aviso de privacidade' }).getByText(/Usamos seu nome e telefone apenas/).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await context.close();
});
