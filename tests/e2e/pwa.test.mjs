// PWA: instalação, abertura sem internet e o que o service worker guarda (ou não guarda).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './_browser.mjs';

let app;
before(async () => { app = await launch(); });
after(async () => { await app.close(); });

test('manifestos válidos com ícones e nome', async () => {
  for (const file of ['cliente.webmanifest', 'painel.webmanifest']) {
    const m = await (await fetch(`${app.url}/${file}`)).json();
    assert.equal(m.lang, 'pt-BR');
    assert.equal(m.display, 'standalone');
    for (const size of ['192x192', '512x512']) assert.ok(m.icons.some((i) => i.sizes === size), `${file} ${size}`);
    for (const icon of m.icons) assert.equal((await fetch(`${app.url}/${icon.src}`)).status, 200);
  }
});

test('abre sem internet a partir do cache, avisa e não deixa agendar', async () => {
  const { page, context } = await app.open({ now: null });
  await page.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // agora a página está sob controle do service worker
  await page.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
  await page.waitForTimeout(800);

  // aberta e já em uso, a internet cai: aviso imediato e nenhum horário inventado
  await context.setOffline(true);
  await page.getByText('Sem conexão. Os dados podem estar desatualizados').waitFor();
  await page.locator('button.prow').first().click();
  await page.getByText('Não foi possível carregar os horários.').waitFor();
  assert.equal(await page.locator('.slot').count(), 0);

  // reaberta sem internet: a casca vem do cache, mas nenhum dado antigo aparece
  await page.reload();
  await page.getByRole('heading', { name: 'Sem conexão' }).waitFor();
  assert.equal(await page.locator('button.prow').count(), 0);
  // quando a internet volta, a tela se recupera sozinha
  await context.setOffline(false);
  await page.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  await context.close();
});

test('o cache do service worker contém só arquivos estáticos, nunca dados', async () => {
  const { page, context } = await app.open({ now: null });
  await page.getByRole('heading', { name: 'Escolha o serviço' }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.locator('button.prow').first().click();
  await page.locator('.slot').first().waitFor();
  await page.waitForTimeout(800);
  const urls = await page.evaluate(async () => {
    const out = [];
    for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) out.push(new URL(req.url).pathname + new URL(req.url).search);
    return out;
  });
  assert.ok(urls.length > 0);
  for (const url of urls) assert.match(url, /^\/([a-z]+\.html|css\/.+\.css|js\/.+\.js|config\.js|vendor\/.+\.(js|woff2)|icons\/.+|[a-z]+\.webmanifest)?$/, url);
  assert.ok(!urls.some((u) => u.includes('?')), 'nada com parâmetros (checagem de relógio) entra no cache');
  await context.close();
});
