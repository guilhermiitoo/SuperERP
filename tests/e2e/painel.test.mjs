// Painel da profissional no navegador (modo demonstração).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, withStore, demoState, DESKTOP } from './_browser.mjs';

let app;
before(async () => { app = await launch(); });
after(async () => { await app.close(); });

// 14:20 de segunda-feira, 16/11/2026 em Manaus
const AFTERNOON = '2026-11-16T18:20:00Z';
const tab = (page, name) => page.getByRole('navigation', { name: 'Seções do painel' }).getByRole('link', { name, exact: true });

async function enter(options = {}) {
  const ctx = await app.open({ path: '/painel.html', now: AFTERNOON, ...options });
  await ctx.page.getByRole('button', { name: 'Entrar na demonstração' }).click();
  await ctx.page.getByText(/atendimentos? hoje/).waitFor();
  return ctx;
}

const bookingsOf = async (page, name) => Object.values((await demoState(page)).bookings).filter((b) => b.customer.name === name);

test('sem entrar, o painel não mostra nenhuma reserva', async () => {
  const { page, context } = await app.open({ path: '/painel.html', now: AFTERNOON });
  await page.getByRole('heading', { name: 'Painel da profissional' }).waitFor();
  const text = await page.locator('body').innerText();
  for (const name of ['Marina', 'Carla', 'Bianca']) assert.ok(!text.includes(name));
  assert.equal(await page.getByRole('navigation').count(), 0);
  await context.close();
});

test('Hoje responde: quantos atendo, qual é o próximo e a lista em ordem', async () => {
  const { page, context, errors } = await enter();
  await page.getByText('4 atendimentos hoje').waitFor();
  await page.getByText('Próximo às 14:00 · 2 concluídos').waitFor();
  const section = page.getByRole('region', { name: 'Próximo atendimento' });
  await section.getByText('Carla Menezes').waitFor();
  await section.getByText('14:00').waitFor();
  const times = await page.getByRole('region', { name: 'Agenda de hoje' }).locator('.appt-time').evaluateAll((els) => els.map((e) => e.firstChild.textContent));
  assert.deepEqual(times, ['09:00', '11:00', '14:00', '16:30']);
  const wa = await section.getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
  assert.match(wa, /^https:\/\/wa\.me\/5592900000003\?text=/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('concluído, não compareceu e desfazer', async () => {
  const { page, context } = await enter();
  await page.getByRole('region', { name: 'Próximo atendimento' }).getByRole('button', { name: 'Concluído' }).click();
  await page.getByText('Marcado como concluído.').waitFor();
  await page.getByText('Próximo às 16:30 · 3 concluídos').waitFor();
  assert.equal((await bookingsOf(page, 'Carla Menezes'))[0].status, 'done');
  await page.getByRole('button', { name: /^14:00, Carla Menezes/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Atendimento' });
  await sheet.getByRole('button', { name: 'Desfazer marcação' }).click();
  await sheet.getByRole('button', { name: 'Não compareceu' }).click();
  await sheet.locator('.chip', { hasText: 'Não compareceu' }).waitFor();
  assert.equal((await bookingsOf(page, 'Carla Menezes'))[0].status, 'noshow');
  await context.close();
});

test('solicitação pendente aparece em destaque; aprovar confirma e oferece o aviso por WhatsApp', async () => {
  const { page, context } = await enter();
  await withStore(page, async (store) => {
    const { settings } = await store.loadBusiness();
    await store.saveSettings({ ...settings, rules: { ...settings.rules, mode: 'approval' } });
    await store.createBooking({ serviceId: 'mao', day: 20261118, start: 168, customer: { name: 'Fernanda Ribeiro', phone: '92900000021' } });
    await store.createBooking({ serviceId: 'mao', day: 20261119, start: 120, customer: { name: 'Paula Fictícia', phone: '92900000022' } });
  });
  await page.reload();
  const box = page.getByRole('region', { name: 'Aguardando sua aprovação' });
  await box.getByText('Fernanda Ribeiro').waitFor();
  await page.getByLabel('2 aguardando aprovação').waitFor();
  await box.getByText(/Responder até ter\., 17\/11 às 02:20/).first().waitFor();

  await box.locator('.pending-item', { hasText: 'Fernanda Ribeiro' }).getByRole('button', { name: 'Aprovar' }).click();
  const sheet = page.getByRole('dialog', { name: 'Atendimento' });
  await sheet.getByText('Aprovado. Avise a cliente:').waitFor();
  const wa = await sheet.getByRole('link', { name: 'Avisar pelo WhatsApp' }).getAttribute('href');
  assert.match(decodeURIComponent(wa), /Olá, Fernanda! Seu horário no Studio Aurora \(demonstração\) está confirmado/);
  assert.match(decodeURIComponent(wa), /#\/r\/[A-Za-z0-9_-]{43}/);
  assert.equal((await bookingsOf(page, 'Fernanda Ribeiro'))[0].status, 'confirmed');
  await page.keyboard.press('Escape');

  await box.locator('.pending-item', { hasText: 'Paula Fictícia' }).getByRole('button', { name: 'Recusar' }).click();
  await page.getByText('Solicitação recusada. O horário foi liberado.').waitFor();
  assert.equal((await bookingsOf(page, 'Paula Fictícia'))[0].status, 'declined');
  assert.deepEqual((await demoState(page)).days[20261119].holds, {});
  await page.getByText(/atendimentos? hoje/).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Aguardando sua aprovação' }).count(), 0);
  await context.close();
});

test('reserva manual usa a mesma disponibilidade do link e não deixa sobrepor', async () => {
  const { page, context } = await enter();
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nova reserva' });
  await sheet.getByLabel('Serviço').selectOption('mao-pe');
  await sheet.getByRole('button', { name: /^terça-feira, 17 de novembro/ }).click();
  const offered = await sheet.locator('.slot').allTextContents();
  assert.ok(!offered.includes('09:30') && !offered.includes('15:00'), 'horários já ocupados não são oferecidos');
  await sheet.locator('.slot', { hasText: '13:00' }).click();
  await sheet.getByText('terça-feira, 17 de novembro, às 13:00').waitFor();
  await sheet.getByLabel('Nome da cliente').fill('Cliente Manual');
  await sheet.getByLabel('Telefone com DDD').fill('92 98888-7777');
  await sheet.getByRole('button', { name: 'Salvar reserva' }).click();
  await page.getByText('Reserva salva. Quer avisar a cliente?').waitFor();
  const [b] = await bookingsOf(page, 'Cliente Manual');
  assert.equal(b.status, 'confirmed');
  assert.equal(b.source, 'manual');
  assert.equal(b.day, 20261117);
  await page.keyboard.press('Escape');
  // o link público deixa de oferecer aquele horário
  const client = await context.newPage();
  await client.clock.setFixedTime(new Date(AFTERNOON));
  await client.goto(app.url + '/');
  await client.locator('button.prow', { hasText: 'Mão + pé' }).click();
  await client.getByRole('button', { name: /^terça-feira, 17 de novembro/ }).click();
  await client.locator('.slot').first().waitFor();
  assert.ok(!(await client.locator('.slot').allTextContents()).includes('13:00'));
  await context.close();
});

test('remarcar e cancelar pela ficha do atendimento', async () => {
  const { page, context } = await enter();
  await page.getByRole('button', { name: /^16:30, Bianca Farias/ }).click();
  let sheet = page.getByRole('dialog', { name: 'Atendimento' });
  await sheet.getByRole('button', { name: 'Remarcar' }).click();
  const picker = page.getByRole('dialog', { name: 'Escolha o novo horário' });
  await picker.getByRole('button', { name: /^quinta-feira, 19 de novembro/ }).click();
  await picker.locator('.slot', { hasText: '09:00' }).click();
  await page.getByRole('dialog', { name: 'Remarcar?' }).getByRole('button', { name: 'Remarcar' }).click();
  await sheet.getByText('Remarcado. Avise a cliente:').waitFor();
  let [b] = await bookingsOf(page, 'Bianca Farias');
  assert.equal(b.day, 20261119);
  assert.equal(b.start, 108);
  const state = await demoState(page);
  assert.equal(state.days[20261116].busy[198], undefined, 'o horário antigo foi liberado');
  assert.equal(state.days[20261119].busy[108], true);

  await sheet.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Cancelar este atendimento?' }).getByRole('button', { name: 'Cancelar atendimento' }).click();
  await sheet.getByText('Cancelado e horário liberado. Avise a cliente:').waitFor();
  [b] = await bookingsOf(page, 'Bianca Farias');
  assert.equal(b.status, 'cancelled');
  assert.equal(b.endedBy, 'owner');
  assert.equal((await demoState(page)).days[20261119].busy[108], undefined);
  await context.close();
});

test('bloqueio rápido tira o horário do link e avisa sobre atendimentos no período', async () => {
  const { page, context } = await enter();
  await tab(page, 'Agenda').click();
  await page.getByRole('button', { name: /^quarta-feira, 18 de novembro/ }).click();
  await page.getByRole('heading', { name: 'quarta-feira, 18 de novembro' }).waitFor();
  await page.getByRole('button', { name: 'Bloquear' }).click();
  const sheet = page.getByRole('dialog', { name: 'Bloquear horário' });
  assert.equal(await sheet.getByLabel('Dia', { exact: true }).inputValue(), '2026-11-18');
  await sheet.getByLabel('Das').fill('09:00');
  await sheet.getByLabel('Até').fill('12:00');
  await sheet.getByText(/Há 1 atendimento marcado neste período \(Luana Peixoto\)/).waitFor();
  await sheet.getByLabel('Anotação').fill('consulta (fictício)');
  await sheet.getByRole('button', { name: 'Bloquear' }).click();
  await page.getByText('Horário bloqueado. Ele não aparece mais para as clientes.').waitFor();
  await page.getByRole('button', { name: /^Bloqueio das 09:00 às 12:00, consulta/ }).waitFor();
  const day = (await demoState(page)).days[20261118];
  assert.equal(day.off[108], true);
  assert.equal(day.busy[120], true, 'a reserva existente não foi apagada');
  // a anotação do bloqueio não vaza para o documento público do dia
  assert.ok(!JSON.stringify(day).includes('consulta'));

  await sheet.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Bloquear' }).click();
  await page.getByRole('dialog', { name: 'Bloquear horário' }).getByText('Dia inteiro').click();
  await page.getByRole('dialog', { name: 'Bloquear horário' }).getByLabel('Dia', { exact: true }).fill('2026-11-20');
  await page.getByRole('dialog', { name: 'Bloquear horário' }).getByRole('button', { name: 'Bloquear' }).click();
  await page.getByText('Horário bloqueado.').first().waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('agenda-base-demo-v1')).days[20261120].shut === true);
  await context.close();
});

test('agenda por semana mostra os sete dias, com reservas e dias fechados', async () => {
  const { page, context } = await enter();
  await tab(page, 'Agenda').click();
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  for (const title of ['segunda-feira, 16 de novembro', 'quinta-feira, 19 de novembro', 'domingo, 22 de novembro']) await page.getByRole('heading', { name: title }).waitFor();
  await page.getByRole('region', { name: 'domingo, 22 de novembro' }).getByText('Fechado neste dia.').waitFor();
  await page.getByRole('region', { name: 'quinta-feira, 19 de novembro' }).locator('.appt-name', { hasText: 'Sabrina Couto' }).waitFor();
  await page.getByRole('button', { name: 'Próxima semana' }).click();
  await page.getByRole('heading', { name: 'segunda-feira, 23 de novembro' }).waitFor();
  await page.getByRole('button', { name: 'Ir para hoje' }).click();
  await page.getByRole('heading', { name: 'segunda-feira, 16 de novembro' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await context.close();
});

test('clientes: busca por nome sem acento e por telefone, histórico e contato', async () => {
  const { page, context } = await enter();
  await tab(page, 'Clientes').click();
  const search = page.getByLabel('Buscar cliente por nome ou telefone');
  await page.getByText('8 clientes').waitFor();
  await search.fill('jessica');
  await page.getByText('1 cliente', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Jéssica Andrade/ }).waitFor();
  await search.fill('0000 0004');
  await page.getByRole('button', { name: /Bianca Farias/ }).waitFor();
  await search.fill('zzz');
  await page.getByText('Nada encontrado').waitFor();
  await search.fill('marina');
  await page.getByRole('button', { name: /Marina Lopes/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Marina Lopes' });
  await sheet.getByText('(92) 90000-0001').waitFor();
  await sheet.getByText('16/11/2026 · 09:00').waitFor();
  await sheet.getByText('Concluído').waitFor();
  assert.match(await sheet.getByRole('link', { name: 'WhatsApp' }).getAttribute('href'), /wa\.me\/5592900000001/);
  await context.close();
});

test('pausar novos agendamentos não apaga reservas e bloqueia o link', async () => {
  const { page, context } = await enter();
  const before = Object.keys((await demoState(page)).bookings).length;
  await tab(page, 'Ajustes').click();
  await page.getByText('Receber agendamentos pelo link').click();
  await page.getByText('Agendamentos pelo link pausados.').waitFor();
  await page.getByText('Pausado: ninguém consegue reservar.').waitFor();
  assert.equal((await demoState(page)).config.rules.paused, true);
  assert.equal(Object.keys((await demoState(page)).bookings).length, before);
  await tab(page, 'Hoje').click();
  await page.getByText('Agendamentos pelo link pausados.', { exact: false }).first().waitFor();
  const client = await context.newPage();
  await client.goto(app.url + '/');
  await client.getByRole('heading', { name: 'Agendamentos pausados' }).waitFor();
  await context.close();
});

test('serviços: mudar preço não altera reserva existente; desativar tira do link', async () => {
  const { page, context } = await enter();
  await page.goto(app.url + '/painel.html#/ajustes/servicos');
  await page.getByRole('button', { name: 'Editar Mão', exact: true }).click();
  let sheet = page.getByRole('dialog', { name: 'Editar serviço' });
  await sheet.getByLabel('Preço (R$)').fill('42,50');
  await sheet.getByRole('button', { name: 'Salvar serviço' }).click();
  await page.getByText('Serviço salvo. Reservas já feitas não mudam.').waitFor();
  await page.getByText('R$ 42,50').waitFor();
  const state = await demoState(page);
  assert.equal(state.services.mao.price, 4250);
  assert.equal(Object.values(state.bookings).find((b) => b.customer.name === 'Jéssica Andrade').service.price, 3500);

  await page.getByRole('button', { name: 'Editar Spa dos pés' }).click();
  sheet = page.getByRole('dialog', { name: 'Editar serviço' });
  await sheet.getByText('Disponível para agendamento').click();
  await sheet.getByRole('button', { name: 'Salvar serviço' }).click();
  await page.getByRole('button', { name: 'Editar Spa dos pés (inativo)' }).waitFor();

  await page.getByRole('button', { name: 'Novo' }).click();
  sheet = page.getByRole('dialog', { name: 'Novo serviço' });
  await sheet.getByRole('button', { name: 'Salvar serviço' }).click();
  await sheet.getByText('Digite o nome do serviço.').waitFor();
  await sheet.getByLabel('Nome do serviço').fill('Blindagem');
  await sheet.getByLabel('Preço (R$)').fill('90');
  await sheet.getByLabel('Duração').selectOption('60');
  await sheet.getByRole('button', { name: 'Salvar serviço' }).click();
  await page.getByRole('button', { name: 'Editar Blindagem' }).waitFor();

  const client = await context.newPage();
  await client.goto(app.url + '/');
  await client.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  const names = await client.locator('.prow-title').allTextContents();
  assert.ok(names.includes('Blindagem') && !names.includes('Spa dos pés'));
  await client.getByLabel('R$ 42,50').waitFor();
  await context.close();
});

test('horários e regras: salvar atualiza a agenda publicada', async () => {
  const { page, context } = await enter();
  await page.goto(app.url + '/painel.html#/ajustes/horarios');
  await page.getByRole('button', { name: 'Salvar horários' }).waitFor();
  await page.locator('.dayrow', { hasText: 'Sábado' }).locator('.switch').click();
  await page.getByRole('button', { name: 'Salvar horários' }).click();
  await page.getByText('Horários salvos e agenda atualizada.').waitFor();
  let state = await demoState(page);
  assert.equal(state.config.week[6].open, false);
  assert.equal(state.days[20261121].shut, true);

  await page.goto(app.url + '/painel.html#/ajustes/regras');
  await page.getByRole('button', { name: 'Com aprovação' }).click();
  await page.getByLabel('Prazo para você responder').selectOption('120');
  await page.getByLabel('Antecedência mínima para reservar').selectOption('180');
  await page.getByLabel('Agenda aberta por quantos dias').fill('45');
  await page.getByLabel('Cliente pode cancelar ou remarcar até').selectOption('1440');
  await page.getByRole('button', { name: 'Salvar regras' }).click();
  await page.getByText('Regras salvas. Valem para as próximas reservas.').waitFor();
  state = await demoState(page);
  assert.deepEqual(state.config.rules, { mode: 'approval', minAdvanceMin: 180, maxDays: 45, slotStepMin: 30, cancelLimitMin: 1440, approvalMin: 120, paused: false });
  assert.ok(state.days[20270114], 'os dias novos da janela maior foram publicados');
  await context.close();
});

test('folga por data fecha o dia no link', async () => {
  const { page, context } = await enter();
  await page.goto(app.url + '/painel.html#/ajustes/datas');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  const sheet = page.getByRole('dialog', { name: 'Folga ou data especial' });
  await sheet.getByLabel('Data').fill('2026-11-20');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Sexta-feira, 20 de novembro').waitFor();
  const state = await demoState(page);
  assert.deepEqual(state.config.exceptions, { 20261120: { closed: true } });
  assert.equal(state.days[20261120].shut, true);
  await context.close();
});

test('dados do negócio: nome e cor aparecem para a cliente', async () => {
  const { page, context } = await enter();
  await page.goto(app.url + '/painel.html#/ajustes/negocio');
  await page.getByLabel('Nome do negócio').fill('Barbearia Exemplo (demonstração)');
  await page.getByRole('button', { name: 'Cor #1f4d46' }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByText('Salvo.').waitFor();
  const client = await context.newPage();
  await client.goto(app.url + '/');
  await client.getByText('Barbearia Exemplo (demonstração)').waitFor();
  assert.equal(await client.evaluate(() => getComputedStyle(document.querySelector('.band')).backgroundColor), 'rgb(31, 77, 70)');
  await context.close();
});

test('exportar gera arquivo documentado; importar em navegador limpo recupera as reservas', async () => {
  const { page, context } = await enter();
  await page.goto(app.url + '/painel.html#/ajustes/dados');
  await page.getByText('não um backup automático').waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar tudo' }).click()]);
  const path = join(tmpdir(), `agenda-teste-${Date.now()}.json`);
  await download.saveAs(path);
  const file = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(file.format, 'agenda-base/backup');
  assert.equal(file.bookings.length, 8);
  assert.match(download.suggestedFilename(), /^agenda-2026-11-16\.json$/);
  await context.close();

  // outra instalação (navegador limpo), sem as reservas da primeira
  const other = await enter();
  await withStore(other.page, async (store) => {
    for (const b of await store.listRecent(100)) { if (b.status === 'confirmed') await store.cancelBooking(b.token, 'owner'); await store.deleteBooking(b.token); }
  });
  assert.equal(Object.keys((await demoState(other.page)).bookings).length, 0);
  await other.page.goto(app.url + '/painel.html#/ajustes/dados');
  await other.page.locator('input[type=file]').setInputFiles(path);
  await other.page.getByText('Importação concluída').waitFor();
  await other.page.getByText(/5 reservas ativas e 3 do histórico recuperadas/).waitFor();
  const state = await demoState(other.page);
  assert.equal(Object.keys(state.bookings).length, 8);
  assert.equal(state.days[20261117].busy[114], true);
  // importar de novo não duplica
  await other.page.locator('input[type=file]').setInputFiles(path);
  await other.page.getByText(/8 já existiam ou eram inválidas e foram puladas/).waitFor();
  assert.equal(Object.keys((await demoState(other.page)).bookings).length, 8);
  await other.context.close();
});

test('desktop: navegação lateral, sem rolagem horizontal, conteúdo ao lado do menu', async () => {
  const { page, context, errors } = await enter({ viewport: DESKTOP });
  const nav = await page.getByRole('navigation', { name: 'Seções do painel' }).boundingBox();
  const main = await page.locator('main').boundingBox();
  assert.ok(nav.x < 5 && nav.width < 260, 'menu na lateral esquerda');
  assert.ok(main.x >= nav.width - 1 && main.width > 500, 'conteúdo ocupa a área ao lado');
  for (const name of ['Agenda', 'Clientes', 'Ajustes', 'Hoje']) {
    await tab(page, name).click();
    await page.locator('main h1').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, name);
  }
  assert.deepEqual(errors, []);
  await context.close();
});
