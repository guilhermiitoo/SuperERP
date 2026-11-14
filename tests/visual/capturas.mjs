// Capturas de tela para revisão visual (celular e desktop), no modo demonstração.
//   node tests/visual/capturas.mjs <pasta-de-saida>
import { mkdirSync } from 'node:fs';
import { launch, MOBILE, DESKTOP, withStore } from '../e2e/_browser.mjs';

const out = process.argv[2] || 'test-results/capturas';
mkdirSync(out, { recursive: true });
const app = await launch();
const problems = [];

async function run(name, viewport, path, steps) {
  // 14:20 de segunda-feira: há atendimentos passados, um em andamento e outros por vir
  const { page, context, errors } = await app.open({ viewport, path, now: '2026-11-16T18:20:00Z' });
  const shot = async (label) => { await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${name}-${label}.png`, fullPage: true }); };
  await steps(page, shot);
  problems.push(...errors.map((e) => `${name}: ${e}`));
  await context.close();
}

const cliente = async (page, shot) => {
  await page.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  await shot('1-servico');
  await page.locator('button.prow', { hasText: 'Mão + pé' }).click();
  await page.locator('.slot').first().waitFor();
  await shot('2-horario');
  await page.locator('.slot').first().click();
  await page.getByLabel('Seu nome').fill('Maria Souza');
  await page.getByLabel(/Telefone/).fill('92991234567');
  await shot('3-dados');
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
  await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();
  await shot('4-confirmado');
};

const painel = async (page, shot) => {
  await page.getByRole('button', { name: 'Entrar na demonstração' }).click();
  await page.getByText(/atendimentos? hoje/).waitFor();
  // uma solicitação pendente para a tela mostrar o destaque de aprovação
  await withStore(page, async (store) => {
    const { settings } = await store.loadBusiness();
    await store.saveSettings({ ...settings, rules: { ...settings.rules, mode: 'approval' } });
    await store.createBooking({ serviceId: 'gel', day: 20261118, start: 168, customer: { name: 'Fernanda Ribeiro', phone: '92900000021' } });
    await store.saveSettings(settings);
  });
  await page.reload();
  await page.getByText('Aguardando sua aprovação (1)').waitFor();
  await shot('1-hoje');
  await page.locator('.plist .appt').first().click();
  await page.getByRole('dialog').waitFor();
  await shot('2-atendimento');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await page.getByRole('heading', { name: 'quarta-feira, 18 de novembro' }).waitFor();
  await shot('3-semana');
  await page.getByRole('link', { name: 'Clientes', exact: true }).click();
  await page.getByLabel('Buscar cliente por nome ou telefone').waitFor();
  await shot('4-clientes');
  await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('heading', { name: 'Seu link de agendamento' }).waitFor();
  await shot('5-ajustes');
  await page.getByRole('link', { name: /Horários de atendimento/ }).click();
  await page.getByRole('button', { name: 'Salvar horários' }).waitFor();
  await shot('6-horarios');
  await page.goto(page.url().replace(/#.*/, '#/ajustes/regras'));
  await page.getByRole('button', { name: 'Salvar regras' }).waitFor();
  await shot('7-regras');
  await page.goto(page.url().replace(/#.*/, '#/hoje'));
  await page.getByRole('button', { name: 'Nova reserva' }).click();
  await page.getByRole('dialog', { name: 'Nova reserva' }).locator('.slot').first().waitFor();
  await shot('8-nova-reserva');
};

await run('cliente-celular', MOBILE, '/', cliente);
await run('cliente-desktop', DESKTOP, '/', cliente);
await run('painel-celular', MOBILE, '/painel.html', painel);
await run('painel-desktop', DESKTOP, '/painel.html', painel);
await app.close();
console.log(problems.length ? problems.join('\n') : 'sem erros no console');
