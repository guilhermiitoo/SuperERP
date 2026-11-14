// Apoio aos testes de interface: servidor estático + Chromium, no modo demonstração.
import { chromium } from 'playwright';
import { startServer } from '../../scripts/serve.mjs';

// Segunda-feira, 16/11/2026, 08:00 em Manaus. O relógio do navegador fica fixo neste instante.
export const NOW = '2026-11-16T12:00:00Z';
export const MOBILE = { width: 390, height: 844 };
export const DESKTOP = { width: 1280, height: 800 };

export async function launch(options = {}) {
  const srv = await startServer({ port: 0, ...options });
  const browser = await chromium.launch();
  return {
    url: srv.url,
    browser,
    /** Contexto novo = navegador "limpo" (a demonstração é semeada de novo). */
    async open({ viewport = MOBILE, path = '/', now = NOW } = {}) {
      const context = await browser.newContext({ viewport, locale: 'pt-BR', timezoneId: 'America/Manaus', hasTouch: viewport.width < 600 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      if (now) await page.clock.setFixedTime(new Date(now));
      await page.goto(srv.url + path);
      return { page, context, errors };
    },
    async close() { await browser.close(); await srv.close(); },
  };
}

/** Executa operações direto na camada de dados da página (mesmo armazenamento da tela). */
export function withStore(page, fn, arg) {
  return page.evaluate(async ([source, a]) => {
    const { createAppStore } = await import('/js/boot.js');
    const store = await createAppStore();
    return (0, eval)(`(${source})`)(store, a);
  }, [fn.toString(), arg]);
}

/** Estado bruto da demonstração (para conferir o que realmente foi gravado). */
export const demoState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('agenda-base-demo-v1')));

/** Vai até a tela de dados com o primeiro horário de terça, 17/11. */
export async function untilDetails(page, service = /^Mão$/) {
  await page.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  await page.locator('button.prow').filter({ has: page.locator('.prow-title', { hasText: service }) }).first().click();
  await page.getByRole('button', { name: /^terça-feira, 17 de novembro/ }).click();
  const slot = page.locator('.slot').first();
  const label = (await slot.textContent()).trim();
  await slot.click();
  await page.getByRole('heading', { name: 'Confira e confirme' }).waitFor();
  return label;
}

export async function fillCustomer(page, name = 'Maria Souza', phone = '92 99123-4567') {
  await page.getByLabel('Seu nome').fill(name);
  await page.getByLabel(/Telefone/).fill(phone);
}
