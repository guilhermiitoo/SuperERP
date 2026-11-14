// Clientes: busca por nome ou telefone e histórico de atendimentos.
// Não existe cadastro separado: a lista é montada a partir das reservas.

import { h, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet } from '../ui/overlay.js';
import { fmtDayNumeric, fmtMoney, fmtTime } from '../core/time.js';
import { fmtPhone } from '../core/validate.js';
import { waLink } from '../core/whatsapp.js';
import { bookingSheet, chip, isLive, manualSheet, timeOf } from './common.js';

const LIMIT = 500;
let query = '';
const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function groupCustomers(bookings, nowMs) {
  const map = new Map();
  for (const b of [...bookings].sort((a, z) => z.startAt - a.startAt)) {
    let c = map.get(b.customer.phone);
    if (!c) { c = { name: b.customer.name, phone: b.customer.phone, bookings: [], visits: 0, last: null, next: null }; map.set(b.customer.phone, c); }
    c.bookings.push(b);
    if (b.effectiveStatus === 'done' || (b.effectiveStatus === 'confirmed' && b.startAt < nowMs)) { c.visits++; c.last ??= b; }
    if (isLive(b) && b.startAt >= nowMs) c.next = b;
  }
  return [...map.values()].sort((a, z) => a.name.localeCompare(z.name, 'pt-BR'));
}

export async function renderClientes(ctx, main, _rest, alive) {
  mount(main, h('h1', { tabindex: '-1' }, 'Clientes'), h('div.skeleton', { style: { height: '3.25rem' } }), h('div.skeleton', { style: { height: '18rem' } }));
  const bookings = await ctx.store.listRecent(LIMIT);
  if (!alive()) return;
  const customers = groupCustomers(bookings, ctx.store.now());
  const listEl = h('div');
  const dayText = (b) => fmtDayNumeric(timeOf(ctx, b).day);

  function open(c) {
    const wa = waLink(c.phone, `Olá, ${c.name.split(' ')[0]}! Tudo bem?`);
    let sheet;
    sheet = openSheet({
      title: c.name,
      body: [
        h('dl.facts.card',
          h('div', h('dt', 'Telefone'), h('dd.num', fmtPhone(c.phone))),
          h('div', h('dt', 'Atendimentos realizados'), h('dd.num', String(c.visits))),
          c.next ? h('div', h('dt', 'Próximo horário'), h('dd.num', `${dayText(c.next)} às ${fmtTime(timeOf(ctx, c.next).minutes)}`)) : null),
        h('div.grid-2',
          h('a.btn', { href: wa, target: '_blank', rel: 'noopener' }, icon('chat'), 'WhatsApp'),
          h('button.btn.btn-primary', { type: 'button', onclick: () => { sheet.close(); manualSheet(ctx, { customer: c, onDone: ctx.reload }); } }, icon('plus'), 'Reservar')),
        h('h3', 'Histórico'),
        h('div.plist', c.bookings.map((b) => h('button.appt', { type: 'button', onclick: () => { sheet.close(); bookingSheet(ctx, b, { onDone: ctx.reload }); } },
          h('span.appt-main', h('div.appt-name', `${dayText(b)} · ${fmtTime(timeOf(ctx, b).minutes)}`), h('div.appt-sub', `${b.service.name} · ${fmtMoney(b.service.price)}`)),
          chip(b), icon('right')))),
      ],
    });
  }

  function draw() {
    const q = fold(query.trim());
    const digits = query.replace(/\D/g, '');
    const found = !q ? customers : customers.filter((c) => fold(c.name).includes(q) || (digits.length >= 3 && c.phone.includes(digits)));
    if (!customers.length) {
      return mount(listEl, h('div.empty.card', icon('users'), h('strong', 'Nenhuma cliente ainda'), h('span', 'Elas aparecem aqui depois da primeira reserva.')));
    }
    if (!found.length) {
      return mount(listEl, h('div.empty.card', icon('search'), h('strong', 'Nada encontrado'), h('span', 'Confira o nome ou tente pelos últimos dígitos do telefone.')));
    }
    return mount(listEl, h('p.small.muted', { 'aria-live': 'polite' }, `${found.length} ${found.length === 1 ? 'cliente' : 'clientes'}`),
      h('div.plist', found.map((c) => h('button.appt', { type: 'button', onclick: () => open(c) },
        h('span.appt-main', h('div.appt-name', c.name),
          h('div.appt-sub.wrap', `${fmtPhone(c.phone)} · ${c.visits === 0 ? 'sem atendimentos' : c.visits === 1 ? '1 atendimento' : `${c.visits} atendimentos`}`),
          c.next ? h('span.chip.chip-ok', 'Tem horário') : null), icon('right')))));
  }

  const search = h('input.input', { type: 'search', placeholder: 'Nome ou telefone', value: query, 'aria-label': 'Buscar cliente por nome ou telefone', autocomplete: 'off', oninput: (e) => { query = e.target.value; draw(); } });
  mount(main,
    h('h1', { tabindex: '-1' }, 'Clientes'),
    h('div.searchbox', icon('search'), search),
    listEl,
    bookings.length >= LIMIT ? h('p.small.muted', `Mostrando as clientes das ${LIMIT} reservas mais recentes.`) : null);
  draw();
}
