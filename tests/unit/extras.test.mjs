import test from 'node:test';
import assert from 'node:assert/strict';
import { themeFrom, contrast } from '../../public/js/core/theme.js';
import { waLink, messageFor } from '../../public/js/core/whatsapp.js';
import { buildIcs } from '../../public/js/core/ics.js';
import { notifier } from '../../public/js/core/notify.js';

const booking = {
  token: 't'.repeat(43), bid: 'b'.repeat(20), status: 'confirmed', day: 20261116, start: 120,
  startAt: Date.parse('2026-11-16T14:00:00Z'),
  service: { id: 'mao', name: 'Mão', price: 3500, duration: 45, buffer: 10 },
  customer: { name: 'Maria Souza', phone: '92991234567' },
};
const business = { name: 'Studio Aurora', phone: '92900000000', address: 'Rua das Acácias, 123; Centro' };
const ctx = { business, offsetMin: -240, link: 'https://exemplo.test/#/r/' + booking.token };

test('tema: texto sobre a cor principal e cor usada como texto têm contraste AA', () => {
  for (const hex of ['#8b2f4b', '#f5c518', '#1f6f5c', '#ffffff', '#000000', '#e88fa6', '#2456a6']) {
    const t = themeFrom(hex);
    assert.ok(contrast(t.onAccent, t.accent) >= 4.5, `${hex}: texto sobre a cor`);
    assert.ok(contrast(t.accentText, '#fbf7f7') >= 4.5, `${hex}: cor como texto`);
  }
  assert.equal(themeFrom('#8b2f4b').onAccent, '#ffffff');
  assert.equal(themeFrom('#8b2f4b').accentText, '#8b2f4b');
  assert.equal(themeFrom('nada').accent, '#8b2f4b');
});

test('WhatsApp: link com DDI 55 e texto codificado; sem telefone não há link', () => {
  const url = waLink('92900000000', 'Olá, tudo bem?');
  assert.equal(url, 'https://wa.me/5592900000000?text=Ol%C3%A1%2C%20tudo%20bem%3F');
  assert.equal(waLink('', 'x'), null);
});

test('WhatsApp: mensagens da cliente para o estabelecimento', () => {
  const ok = messageFor('customer_confirmed', booking, ctx);
  assert.match(ok, /Maria Souza/);
  assert.match(ok, /Mão/);
  assert.match(ok, /segunda-feira, 16 de novembro/);
  assert.match(ok, /10:00/);
  const pending = messageFor('customer_pending', { ...booking, status: 'pending' }, ctx);
  assert.match(pending, /solicita/i);
  assert.match(pending, /confirma/i);
  assert.match(messageFor('customer_rescheduled', booking, ctx), /remarquei/i);
  assert.match(messageFor('customer_cancelled', booking, ctx), /cancelei/i);
});

test('WhatsApp: mensagens do estabelecimento para a cliente trazem o link da reserva', () => {
  for (const kind of ['owner_confirmed', 'owner_reminder', 'owner_rescheduled']) {
    const text = messageFor(kind, booking, ctx);
    assert.match(text, /Maria/);
    assert.match(text, /10:00/);
    assert.ok(text.includes(ctx.link), kind);
  }
  assert.match(messageFor('owner_declined', booking, ctx), /não (vou conseguir|consigo)/i);
  assert.match(messageFor('owner_cancelled', booking, ctx), /cancel/i);
  assert.ok(messageFor('owner_hello', booking, ctx).startsWith('Olá, Maria'));
});

test('.ics: evento em UTC com duração do atendimento, local e link', () => {
  const ics = buildIcs(booking, { ...ctx, nowMs: Date.parse('2026-11-14T12:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /DTSTART:20261116T140000Z\r\n/);
  assert.match(ics, /DTEND:20261116T144500Z\r\n/);
  assert.match(ics, /DTSTAMP:20261114T120000Z\r\n/);
  assert.match(ics, /SUMMARY:Mão — Studio Aurora\r\n/);
  assert.match(ics, /LOCATION:Rua das Acácias\\, 123\; Centro\r\n/);
  assert.match(ics, /STATUS:CONFIRMED\r\n/);
  assert.match(ics, /UID:b{20}@agenda-base\r\n/);
  assert.ok(ics.replace(/\r\n /g, '').includes(ctx.link));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `linha longa: ${line}`);
});

test('.ics: solicitação pendente entra como provisória', () => {
  assert.match(buildIcs({ ...booking, status: 'pending' }, { ...ctx, nowMs: 0 }), /STATUS:TENTATIVE\r\n/);
});

test('automação de mensagens vem desativada e nunca afirma ter enviado', async () => {
  assert.equal(notifier.enabled, false);
  assert.deepEqual(await notifier.notify('booking_created', booking), { status: 'disabled' });
});
