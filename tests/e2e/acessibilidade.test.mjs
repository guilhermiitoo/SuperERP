// Auditoria automática de acessibilidade (axe-core, WCAG 2.2 A/AA) nas telas principais.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch, DESKTOP, MOBILE } from './_browser.mjs';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
let app;
before(async () => { app = await launch(); });
after(async () => { await app.close(); });

async function audit(page) {
  await page.waitForTimeout(500); // animações de entrada terminam
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

for (const viewport of [MOBILE, DESKTOP]) {
  test(`cliente sem violações WCAG AA (${viewport.width}px)`, async () => {
    const { page, context } = await app.open({ viewport });
    const found = [];
    await page.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
    found.push(...await audit(page));
    await page.locator('button.prow').first().click();
    await page.locator('.slot').first().waitFor();
    found.push(...await audit(page));
    await page.locator('.slot').first().click();
    await page.getByLabel('Seu nome').fill('Maria Souza');
    await page.getByLabel(/Telefone/).fill('92991234567');
    found.push(...await audit(page));
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    await page.getByRole('heading', { name: 'Agendamento confirmado' }).waitFor();
    found.push(...await audit(page));
    assert.deepEqual(found, []);
    await context.close();
  });

  test(`painel sem violações WCAG AA (${viewport.width}px)`, async () => {
    const { page, context } = await app.open({ viewport, path: '/painel.html', now: '2026-11-16T18:20:00Z' });
    const found = [];
    await page.getByRole('button', { name: 'Entrar na demonstração' }).waitFor();
    found.push(...await audit(page));
    await page.getByRole('button', { name: 'Entrar na demonstração' }).click();
    await page.getByText(/atendimentos? hoje/).waitFor();
    found.push(...await audit(page));
    for (const hash of ['#/agenda', '#/clientes', '#/ajustes', '#/ajustes/servicos', '#/ajustes/horarios', '#/ajustes/regras', '#/ajustes/negocio', '#/ajustes/dados']) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.locator('main h1').waitFor();
      await page.waitForLoadState('networkidle');
      found.push(...(await audit(page)).map((v) => `${hash} ${v}`));
    }
    await page.evaluate(() => { location.hash = '#/hoje'; });
    await page.getByRole('button', { name: 'Nova reserva' }).click();
    await page.getByRole('dialog', { name: 'Nova reserva' }).locator('.slot').first().waitFor();
    found.push(...(await audit(page)).map((v) => `nova-reserva ${v}`));
    assert.deepEqual(found, []);
    await context.close();
  });
}
