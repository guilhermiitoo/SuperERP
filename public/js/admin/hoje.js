// Hoje: quem eu atendo hoje, qual é o próximo e o que precisa da minha aprovação.

import { h, mount, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { leaf } from '../ui/leaf.js';
import { toast } from '../ui/overlay.js';
import { fmtDayShort, fmtMoney, fmtTime } from '../core/time.js';
import { apptRow, blockRow, blockSheet, bookingSheet, deadline, isLive, manualSheet, timeOf, waButton } from './common.js';

let timer = null;

export async function renderHoje(ctx, main, _rest, alive) {
  clearInterval(timer);
  mount(main, h('div.stack', { 'aria-busy': 'true' }, h('div.skeleton', { style: { height: '7rem' } }), h('div.skeleton', { style: { height: '9rem' } }), h('div.skeleton', { style: { height: '14rem' } }), h('p.sr-only', 'Carregando o dia…')));
  const today = ctx.today();
  const [list, pending, blocks] = await Promise.all([
    ctx.store.listBookings({ fromDay: today, toDay: today }),
    ctx.store.listPending(),
    ctx.store.listBlocks(),
  ]);
  if (!alive()) return;
  ctx.setPending(pending.length);
  const reload = ctx.reload;
  const now = ctx.store.now();
  const live = list.filter(isLive);
  const done = list.filter((b) => b.effectiveStatus === 'done').length;
  const kept = list.filter((b) => isLive(b) || b.effectiveStatus === 'done' || b.effectiveStatus === 'noshow');
  const upcoming = live.filter((b) => b.effectiveStatus === 'confirmed' && b.startAt + b.service.duration * 60000 > now);
  const next = upcoming[0];
  const todayBlocks = blocks.filter((b) => b.day === today);

  const count = kept.length === 0 ? 'Nenhum atendimento hoje' : `${kept.length} ${kept.length === 1 ? 'atendimento' : 'atendimentos'} hoje`;
  const sub = next
    ? `Próximo às ${fmtTime(timeOf(ctx, next).minutes)}${done ? ` · ${done} ${done === 1 ? 'concluído' : 'concluídos'}` : ''}`
    : kept.length ? 'Não há mais atendimentos por hoje.' : 'Aproveite para divulgar seu link de agendamento.';

  // ---- pendências
  const pendingBox = pending.length ? h('section', { 'aria-label': 'Aguardando sua aprovação' },
    h('h2', `Aguardando sua aprovação (${pending.length})`),
    h('div.pending', pending.map((b) => {
      const { day, minutes } = timeOf(ctx, b);
      const approve = h('button.btn.btn-ok', { type: 'button', onclick: () => busy(approve, async () => {
        try {
          const ok = await ctx.store.approveBooking(b.token);
          await reload();
          bookingSheet(ctx, ok, { onDone: reload }).body.prepend(h('div.notice.notice-ok', { role: 'status' }, icon('check'),
            h('div.stack-sm.grow', h('span', 'Aprovado. Avise a cliente:'), waButton(ctx, 'owner_confirmed', ok, 'Avisar pelo WhatsApp', 'btn btn-sm'),
              h('span.tiny', 'A mensagem só é enviada quando você tocar em enviar.'))));
        } catch (err) { ctx.fail(err); reload(); }
      }) }, icon('check'), 'Aprovar');
      const decline = h('button.btn.btn-danger', { type: 'button', onclick: () => busy(decline, async () => {
        try { await ctx.store.declineBooking(b.token); toast('Solicitação recusada. O horário foi liberado.'); } catch (err) { ctx.fail(err); }
        reload();
      }) }, 'Recusar');
      return h('div.pending-item',
        h('button.appt', { type: 'button', style: { padding: 0, minHeight: 0 }, onclick: () => bookingSheet(ctx, b, { onDone: reload }), 'aria-label': `Ver solicitação de ${b.customer.name}` },
          h('span.appt-time', fmtTime(minutes), h('small', day === today ? 'hoje' : fmtDayShort(day).split(',')[1].trim())),
          h('span.appt-main', h('div.appt-name', b.customer.name), h('div.appt-sub', `${b.service.name} · ${fmtMoney(b.service.price)}`))),
        h('p.small', `Responder até ${deadline(ctx, b.expiresAt)}.`),
        h('div.pending-actions', decline, approve));
    }))) : null;

  // ---- próximo atendimento
  let nextBox = null;
  if (next) {
    const { minutes } = timeOf(ctx, next);
    const started = now >= next.startAt;
    const finish = (outcome, button) => busy(button, async () => {
      try { await ctx.store.finishBooking(next.token, outcome); toast(outcome === 'done' ? 'Marcado como concluído.' : 'Marcado como não compareceu.'); } catch (err) { ctx.fail(err); }
      reload();
    });
    const doneBtn = h('button.btn.btn-ok', { type: 'button', onclick: () => finish('done', doneBtn) }, icon('check'), 'Concluído');
    const noShowBtn = h('button.btn', { type: 'button', onclick: () => finish('noshow', noShowBtn) }, 'Não veio');
    nextBox = h('section', { 'aria-label': 'Próximo atendimento' },
      h('h2', started ? 'Em atendimento' : 'Próximo atendimento'),
      h('div.next',
        h('div.next-row', h('div.next-time', fmtTime(minutes)),
          h('div.grow', h('div.next-name', next.customer.name), h('div.muted', `${next.service.name} · até ${fmtTime(minutes + next.service.duration)}`))),
        h('div.next-actions',
          waButton(ctx, started ? 'owner_hello' : 'owner_reminder', next, started ? 'WhatsApp' : 'Lembrete'),
          h('button.btn', { type: 'button', onclick: () => bookingSheet(ctx, next, { onDone: reload }) }, 'Detalhes'),
          started ? noShowBtn : null, started ? doneBtn : null)));
  }

  // ---- lista do dia (reservas e bloqueios, em ordem)
  const rows = [
    ...list.map((b) => ({ at: timeOf(ctx, b).minutes, el: apptRow(ctx, b, { onDone: reload }) })),
    ...todayBlocks.map((b) => ({ at: b.allDay ? -1 : b.s, el: blockRow(ctx, b, { onDone: reload }) })),
  ].sort((a, b) => a.at - b.at);

  const paused = ctx.settings.rules.paused;
  mount(main,
    h('div.today', leaf(today, { large: true, on: true }),
      h('div.today-main', h('h1', { tabindex: '-1', class: 'sr-only' }, 'Hoje'), h('div.today-count', count), h('div.today-next', sub))),
    paused ? h('div.notice.notice-warn', icon('pause'), h('div.stack-sm.grow', h('span', h('strong', 'Agendamentos pelo link pausados. '), 'As clientes não conseguem reservar. Quem já tem horário continua com ele.'),
      h('a.btn.btn-sm', { href: '#/ajustes' }, 'Reativar em Ajustes'))) : null,
    pendingBox,
    nextBox,
    h('div.quick',
      h('button.btn.btn-primary', { type: 'button', onclick: () => manualSheet(ctx, { day: today, onDone: reload }) }, icon('plus'), 'Nova reserva'),
      h('button.btn', { type: 'button', onclick: () => blockSheet(ctx, { day: today, bookings: list, onDone: reload }) }, icon('ban'), 'Bloquear')),
    h('section', { 'aria-label': 'Agenda de hoje' },
      h('div.sec-head', h('h2', 'Agenda de hoje'), h('a.btn.btn-quiet.btn-sm', { href: '#/agenda' }, 'Ver a semana')),
      rows.length
        ? h('div.plist', rows.map((r) => r.el))
        : h('div.empty.card', icon('calendar'), h('strong', 'Dia livre'), h('span', 'Nenhuma reserva para hoje até agora.'))),
    h('p.updated', `Atualizado às ${fmtTime(Math.floor(((now + ctx.settings.utcOffsetMin * 60000) % 86400000) / 60000))}`,
      h('button.btn.btn-quiet.btn-sm', { type: 'button', onclick: reload }, icon('refresh'), 'Atualizar')));

  // sem servidor para avisar: o painel confere de tempos em tempos enquanto está aberto e visível
  timer = setInterval(() => {
    if (!alive()) return clearInterval(timer);
    if (document.visibilityState === 'visible' && navigator.onLine && !document.querySelector('dialog[open]')) reload();
    return undefined;
  }, 90000);
}
