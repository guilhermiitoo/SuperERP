// Agenda: um dia ou a semana inteira, em lista (cabe na tela do celular).

import { h, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { leaf } from '../ui/leaf.js';
import { addDays, fmtDayLong, weekdayOf } from '../core/time.js';
import { apptRow, blockRow, blockSheet, isLive, manualSheet, timeOf } from './common.js';

const view = { mode: 'day', day: null };

export async function renderAgenda(ctx, main, rest, alive) {
  const today = ctx.today();
  if (rest[0] && /^\d{8}$/.test(rest[0])) view.day = Number(rest[0]);
  if (!view.day) view.day = today;
  const weekStart = addDays(view.day, -((weekdayOf(view.day) + 6) % 7)); // segunda-feira
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  mount(main, h('h1', { tabindex: '-1' }, 'Agenda'), h('div.skeleton', { style: { height: '5rem' } }), h('div.skeleton', { style: { height: '16rem' } }));

  const [list, blocks, dayDocs] = await Promise.all([
    ctx.store.listBookings({ fromDay: days[0], toDay: days[6] }),
    ctx.store.listBlocks(),
    ctx.store.loadDays(days[0], days[6]),
  ]);
  if (!alive()) return;
  const reload = ctx.reload;
  const set = (patch) => { Object.assign(view, patch); ctx.go(`#/agenda/${view.day}`); };

  const rowsOf = (day) => [
    ...list.filter((b) => b.day === day).map((b) => ({ at: timeOf(ctx, b).minutes, el: apptRow(ctx, b, { onDone: reload }) })),
    ...blocks.filter((b) => b.day === day).map((b) => ({ at: b.allDay ? -1 : b.s, el: blockRow(ctx, b, { onDone: reload }) })),
  ].sort((a, b) => a.at - b.at).map((r) => r.el);

  const countOf = (day) => list.filter((b) => b.day === day && isLive(b)).length;
  const closed = (day) => !dayDocs[day] || dayDocs[day].shut;

  const strip = h('div.weeknav',
    h('button.btn.btn-quiet.btn-icon', { type: 'button', 'aria-label': 'Semana anterior', onclick: () => set({ day: addDays(view.day, -7) }) }, icon('left')),
    h('div.leaves', { role: 'group', 'aria-label': 'Dias da semana' }, days.map((day) => {
      const n = countOf(day);
      const el = leaf(day, { on: view.mode === 'day' && day === view.day, top: day === today ? 'hoje' : null, disabled: closed(day), onclick: () => set({ day, mode: 'day' }),
        label: `${fmtDayLong(day)}, ${closed(day) ? 'fechado' : n === 1 ? '1 atendimento' : `${n} atendimentos`}` });
      el.querySelector('.leaf-foot').replaceWith(h('span.leaf-dots', { 'aria-hidden': 'true' }, Array.from({ length: Math.min(n, 5) }, () => h('i'))));
      return el;
    })),
    h('button.btn.btn-quiet.btn-icon', { type: 'button', 'aria-label': 'Próxima semana', onclick: () => set({ day: addDays(view.day, 7) }) }, icon('right')));

  const dayBlock = (day, heading) => {
    const rows = rowsOf(day);
    return h('section.weekday-block', { 'aria-label': fmtDayLong(day) },
      h('div.sec-head', h(heading, fmtDayLong(day)), day === today ? h('span.chip', 'Hoje') : null),
      rows.length ? h('div.plist', rows)
        : h('div.card.muted.small', closed(day) ? 'Fechado neste dia.' : 'Nenhuma reserva.'));
  };

  mount(main,
    h('div.sec-head', h('h1', { tabindex: '-1' }, 'Agenda'),
      view.day !== today ? h('button.btn.btn-quiet.btn-sm', { type: 'button', onclick: () => set({ day: today }) }, 'Ir para hoje') : null),
    h('div.segmented', { role: 'group', 'aria-label': 'Modo de exibição' },
      h('button', { type: 'button', 'aria-pressed': String(view.mode === 'day'), onclick: () => set({ mode: 'day' }) }, 'Dia'),
      h('button', { type: 'button', 'aria-pressed': String(view.mode === 'week'), onclick: () => set({ mode: 'week' }) }, 'Semana')),
    strip,
    view.mode === 'day' ? dayBlock(view.day, 'h2') : days.map((day) => dayBlock(day, 'h2')),
    h('div.quick',
      h('button.btn.btn-primary', { type: 'button', disabled: view.day < today && view.mode === 'day', onclick: () => manualSheet(ctx, { day: Math.max(view.day, today), onDone: reload }) }, icon('plus'), 'Nova reserva'),
      h('button.btn', { type: 'button', onclick: () => blockSheet(ctx, { day: Math.max(view.day, today), bookings: list, onDone: reload }) }, icon('ban'), 'Bloquear')));
}
