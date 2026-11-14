import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailNotifier, EMAILJS_URL } from '../../public/js/core/notify.js';

const booking = {
  token: 't'.repeat(43), bid: 'b'.repeat(20), status: 'confirmed', day: 20261117, start: 168,
  startAt: Date.parse('2026-11-17T18:00:00Z'),
  service: { id: 'mao', name: 'Mão', price: 3500, duration: 45, buffer: 10 },
  customer: { name: 'Maria Souza', phone: '92991234567' },
};
const cfg = { serviceId: 'service_x', templateId: 'template_y', publicKey: 'pk_z' };
const ctx = { business: { name: 'Studio Aurora' }, offsetMin: -240, panelUrl: 'https://exemplo.test/painel.html' };

function fakeFetch(status = 200) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), init }); return { ok: status < 300, status }; };
  fn.calls = calls;
  return fn;
}

test('sem configuração o aviso por e-mail fica desligado e não chama a rede', async () => {
  const fetch = fakeFetch();
  const n = createEmailNotifier({ config: { serviceId: '', templateId: '', publicKey: '' }, ctx, fetch });
  assert.equal(n.enabled, false);
  assert.deepEqual(await n.notify('booking_created', booking), { status: 'disabled' });
  assert.equal(fetch.calls.length, 0);
});

test('nova reserva envia um e-mail com os dados que a profissional precisa', async () => {
  const fetch = fakeFetch();
  const n = createEmailNotifier({ config: cfg, ctx, fetch });
  assert.equal(n.enabled, true);
  assert.deepEqual(await n.notify('booking_created', booking), { status: 'sent' });
  assert.equal(fetch.calls.length, 1);
  const { url, body } = fetch.calls[0];
  assert.equal(url, EMAILJS_URL);
  assert.equal(body.service_id, 'service_x');
  assert.equal(body.template_id, 'template_y');
  assert.equal(body.user_id, 'pk_z');
  const p = body.template_params;
  assert.equal(p.assunto, 'Novo agendamento: Maria Souza, terça-feira, 17 de novembro, às 14:00');
  assert.equal(p.situacao, 'Confirmado');
  assert.equal(p.cliente, 'Maria Souza');
  assert.equal(p.telefone, '(92) 99123-4567');
  assert.equal(p.servico, 'Mão · R$ 35,00');
  assert.equal(p.quando, 'terça-feira, 17 de novembro, às 14:00');
  assert.equal(p.negocio, 'Studio Aurora');
  assert.equal(p.painel, 'https://exemplo.test/painel.html');
  assert.equal(p.whatsapp, 'https://wa.me/5592991234567');
  assert.ok(!JSON.stringify(body).includes(booking.token), 'o código secreto da reserva não vai no e-mail');
});

test('solicitação pendente, remarcação e cancelamento têm assunto próprio', async () => {
  const fetch = fakeFetch();
  const n = createEmailNotifier({ config: cfg, ctx, fetch });
  await n.notify('booking_pending', { ...booking, status: 'pending' });
  await n.notify('booking_rescheduled', booking);
  await n.notify('booking_cancelled', { ...booking, status: 'cancelled' });
  const subjects = fetch.calls.map((c) => c.body.template_params.assunto);
  assert.match(subjects[0], /^Pedido para aprovar: Maria Souza/);
  assert.match(subjects[1], /^Reserva remarcada: Maria Souza/);
  assert.match(subjects[2], /^Reserva cancelada: Maria Souza/);
});

test('falha no envio nunca derruba a reserva: devolve "failed" sem lançar erro', async () => {
  const n1 = createEmailNotifier({ config: cfg, ctx, fetch: fakeFetch(400) });
  assert.deepEqual(await n1.notify('booking_created', booking), { status: 'failed' });
  const n2 = createEmailNotifier({ config: cfg, ctx, fetch: async () => { throw new TypeError('sem rede'); } });
  assert.deepEqual(await n2.notify('booking_created', booking), { status: 'failed' });
});

test('eventos desconhecidos não enviam nada', async () => {
  const fetch = fakeFetch();
  const n = createEmailNotifier({ config: cfg, ctx, fetch });
  assert.deepEqual(await n.notify('qualquer_coisa', booking), { status: 'ignored' });
  assert.equal(fetch.calls.length, 0);
});
