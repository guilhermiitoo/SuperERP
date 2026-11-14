// Peças usadas por mais de uma tela do painel: linha de atendimento, ficha da reserva,
// reserva manual e bloqueio de horário.

import { h, mount, field, busy, copyText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { leaf } from '../ui/leaf.js';
import { timePicker } from '../ui/timepicker.js';
import { openSheet, confirmSheet, toast } from '../ui/overlay.js';
import { STATUS_LABEL, STATUS_SHORT, STATUS_CHIP, errorText } from '../ui/text.js';
import { ATOM_MIN, dayToIso, fmtDayLong, fmtDayShort, fmtMoney, fmtTime, isoToDay, localOf, parseTime } from '../core/time.js';
import { fmtPhone, normalizeName, normalizePhone } from '../core/validate.js';
import { waLink, messageFor } from '../core/whatsapp.js';

export const publicUrl = () => new URL('./', location.href).href;
export const manageUrl = (token) => `${publicUrl()}#/r/${token}`;
export const timeOf = (ctx, b) => localOf(b.startAt, ctx.settings.utcOffsetMin);
export const chip = (b) => h(`span.chip.${STATUS_CHIP[b.effectiveStatus]}`, STATUS_LABEL[b.effectiveStatus]);
export const isLive = (b) => b.effectiveStatus === 'confirmed' || b.effectiveStatus === 'pending';

export function deadline(ctx, ms) {
  const { day, minutes } = localOf(ms, ctx.settings.utcOffsetMin);
  return `${day === ctx.today() ? 'hoje' : fmtDayShort(day)} às ${fmtTime(minutes)}`;
}

function waFor(ctx, kind, b) {
  return waLink(b.customer.phone, messageFor(kind, b, { business: ctx.settings.business, offsetMin: ctx.settings.utcOffsetMin, link: manageUrl(b.token) }));
}

/** Botão que abre o WhatsApp da cliente com o texto pronto. A mensagem só sai quando a pessoa tocar em enviar. */
export function waButton(ctx, kind, b, label, cls = 'btn') {
  return h(`a.${cls.split(' ').join('.')}`, { href: waFor(ctx, kind, b), target: '_blank', rel: 'noopener' }, icon('chat'), label);
}

/** Linha de atendimento em uma lista cronológica. */
export function apptRow(ctx, b, { onDone } = {}) {
  const { minutes } = timeOf(ctx, b);
  const state = b.effectiveStatus;
  const past = b.startAt + b.service.duration * 60000 < ctx.store.now();
  const off = state === 'cancelled' || state === 'declined' || state === 'expired';
  return h(`button.appt${past ? '.is-past' : ''}${off ? '.is-off' : ''}`, {
    type: 'button',
    'aria-label': `${fmtTime(minutes)}, ${b.customer.name}, ${b.service.name}, ${STATUS_LABEL[state]}`,
    onclick: () => bookingSheet(ctx, b, { onDone }),
  },
    h('span.appt-time', fmtTime(minutes), h('small', fmtTime(minutes + b.service.duration))),
    h('span.appt-main', h('div.appt-name', b.customer.name), h('div.appt-sub', b.service.name)),
    state === 'confirmed' ? null : h(`span.chip.${STATUS_CHIP[state]}`, STATUS_SHORT[state]),
    icon('right'));
}

export function blockRow(ctx, block, { onDone } = {}) {
  return h('button.appt.is-block', {
    type: 'button',
    'aria-label': `Bloqueio ${block.allDay ? 'do dia inteiro' : `das ${fmtTime(block.s)} às ${fmtTime(block.e)}`}${block.note ? `, ${block.note}` : ''}`,
    onclick: async () => {
      const ok = await confirmSheet({ title: 'Remover bloqueio?', text: `${fmtDayLong(block.day)}${block.allDay ? ', dia inteiro' : `, das ${fmtTime(block.s)} às ${fmtTime(block.e)}`}. O horário volta a aparecer para as clientes.`, confirmLabel: 'Remover bloqueio', danger: true });
      if (!ok) return;
      try { await ctx.store.deleteBlock(block); toast('Bloqueio removido.'); onDone?.(); } catch (err) { ctx.fail(err); }
    },
  },
    h('span.appt-time', block.allDay ? '—' : fmtTime(block.s), block.allDay ? null : h('small', fmtTime(block.e))),
    h('span.appt-main', h('div.appt-name', block.allDay ? 'Dia bloqueado' : 'Horário bloqueado'), h('div.appt-sub', block.note || 'Sem atendimento')),
    icon('ban'));
}

// ------------------------------------------------------------------ ficha da reserva

export function bookingSheet(ctx, booking, { onDone } = {}) {
  let b = booking;
  let sheet;
  let changed = false;
  let justDid = null;
  const body = h('div.stack');

  async function act(button, fn, did) {
    await busy(button, async () => {
      try {
        b = await fn();
        changed = true;
        justDid = did;
        draw();
      } catch (err) {
        ctx.fail(err);
        if (err.code === 'expired' || err.code === 'not_allowed') { try { b = await ctx.store.getBooking(b.token); draw(); } catch { /* fica como está */ } }
      }
    });
  }

  function editCustomer() {
    const name = h('input.input', { type: 'text', value: b.customer.name, maxlength: '80', autocomplete: 'off' });
    const phone = h('input.input', { type: 'tel', inputmode: 'tel', value: fmtPhone(b.customer.phone), maxlength: '20', autocomplete: 'off' });
    const nameField = field({ label: 'Nome', control: name });
    const phoneField = field({ label: 'Telefone com DDD', control: phone });
    const save = h('button.btn.btn-primary', { type: 'submit' }, 'Salvar');
    const inner = openSheet({
      title: 'Corrigir dados da cliente',
      body: h('form.stack', {
        novalidate: true,
        onsubmit: (e) => {
          e.preventDefault();
          nameField.setError(normalizeName(name.value) ? '' : 'Digite o nome.');
          phoneField.setError(normalizePhone(phone.value) ? '' : 'Confira o telefone: precisa ter DDD.');
          if (!normalizeName(name.value) || !normalizePhone(phone.value)) return;
          act(save, () => ctx.store.updateCustomer(b.token, { name: name.value, phone: phone.value }), null).then(() => inner.close());
        },
      }, nameField, phoneField, save),
    });
  }

  function move() {
    let inner;
    const picker = timePicker({
      store: ctx.store, settings: ctx.settings, service: { ...b.service, active: true }, actor: 'owner',
      selected: { day: b.day, start: b.start }, exclude: { day: b.day, start: b.start, n: b.n },
      onPick: async (p) => {
        const ok = await confirmSheet({ title: 'Remarcar?', text: `${b.customer.name} passa para ${fmtDayLong(p.day)}, às ${p.label}.`, confirmLabel: 'Remarcar' });
        if (!ok) return;
        try {
          b = await ctx.store.rescheduleBooking(b.token, { day: p.day, start: p.start }, 'owner');
          changed = true;
          justDid = 'rescheduled';
          inner.close();
          draw();
        } catch (err) {
          ctx.fail(err);
          if (err.code === 'slot_taken') picker.refresh();
        }
      },
    });
    inner = openSheet({ title: 'Escolha o novo horário', body: picker });
  }

  async function cancel(button) {
    const ok = await confirmSheet({ title: 'Cancelar este atendimento?', text: `${b.customer.name} perde o horário e ele volta a ficar livre. Lembre de avisar a cliente.`, confirmLabel: 'Cancelar atendimento', cancelLabel: 'Manter', danger: true });
    if (ok) await act(button, () => ctx.store.cancelBooking(b.token, 'owner'), 'cancelled');
  }

  function draw() {
    const state = b.effectiveStatus;
    const { day, minutes } = timeOf(ctx, b);
    const started = ctx.store.now() >= b.startAt;
    const followUp = {
      approved: ['owner_confirmed', 'Aprovado. Avise a cliente:', 'Avisar pelo WhatsApp'],
      declined: ['owner_declined', 'Recusado e horário liberado. Avise a cliente:', 'Avisar pelo WhatsApp'],
      rescheduled: ['owner_rescheduled', 'Remarcado. Avise a cliente:', 'Avisar pelo WhatsApp'],
      cancelled: ['owner_cancelled', 'Cancelado e horário liberado. Avise a cliente:', 'Avisar pelo WhatsApp'],
    }[justDid];

    const actions = [];
    if (state === 'pending') {
      const approve = h('button.btn.btn-ok', { type: 'button', onclick: () => act(approve, () => ctx.store.approveBooking(b.token), 'approved') }, icon('check'), 'Aprovar');
      const decline = h('button.btn.btn-danger', { type: 'button', onclick: () => act(decline, () => ctx.store.declineBooking(b.token), 'declined') }, 'Recusar');
      actions.push(h('p.small', h('strong', 'Aguardando sua resposta. '), `Responda até ${deadline(ctx, b.expiresAt)}; depois disso o horário é liberado.`), h('div.grid-2', decline, approve));
    }
    if (state === 'confirmed' && started) {
      const done = h('button.btn.btn-ok', { type: 'button', onclick: () => act(done, () => ctx.store.finishBooking(b.token, 'done'), null) }, icon('check'), 'Concluído');
      const noshow = h('button.btn', { type: 'button', onclick: () => act(noshow, () => ctx.store.finishBooking(b.token, 'noshow'), null) }, 'Não compareceu');
      actions.push(h('div.grid-2', noshow, done));
    }
    if (state === 'done' || state === 'noshow') {
      const undo = h('button.btn.btn-block', { type: 'button', onclick: () => act(undo, () => ctx.store.reopenBooking(b.token), null) }, icon('undo'), 'Desfazer marcação');
      actions.push(undo);
    }
    if (isLive(b)) {
      actions.push(h('div.grid-2',
        waButton(ctx, 'owner_hello', b, 'WhatsApp'),
        state === 'confirmed' ? waButton(ctx, started ? 'owner_hello' : 'owner_reminder', b, started ? 'Mensagem' : 'Lembrete') : waButton(ctx, 'owner_hello', b, 'Mensagem')));
      const cancelBtn = h('button.btn.btn-danger', { type: 'button', onclick: () => cancel(cancelBtn) }, 'Cancelar');
      actions.push(h('div.grid-2', h('button.btn', { type: 'button', onclick: move }, icon('swap'), 'Remarcar'), cancelBtn));
      actions.push(h('button.btn.btn-quiet.btn-block', { type: 'button', onclick: async () => toast((await copyText(manageUrl(b.token))) ? 'Link da reserva copiado.' : 'Não foi possível copiar.') }, icon('copy'), 'Copiar link da reserva da cliente'));
    } else if (!followUp) {
      actions.push(waButton(ctx, 'owner_hello', b, 'Falar pelo WhatsApp', 'btn btn-block'));
    }

    mount(body,
      followUp ? h('div.notice.notice-ok', { role: 'status' }, icon('check'), h('div.stack-sm.grow', h('span', followUp[1]),
        waButton(ctx, followUp[0], b, followUp[2], 'btn btn-sm'),
        h('span.tiny', 'Abre o WhatsApp com o texto pronto. A mensagem só é enviada quando você tocar em enviar.'))) : null,
      h('div.row', leaf(day, { on: isLive(b) }),
        h('div.grow.stack-sm', h('div.next-name', b.customer.name), h('div', chip(b)))),
      h('dl.facts.card',
        h('div', h('dt', 'Horário'), h('dd.num', `${fmtTime(minutes)} às ${fmtTime(minutes + b.service.duration)}`)),
        h('div', h('dt', 'Serviço'), h('dd', b.service.name)),
        h('div', h('dt', 'Valor'), h('dd.num', fmtMoney(b.service.price))),
        h('div', h('dt', 'Telefone'), h('dd.num', fmtPhone(b.customer.phone))),
        h('div', h('dt', 'Origem'), h('dd', b.source === 'manual' ? 'Reserva manual' : 'Link de agendamento'))),
      h('div.stack', actions),
      h('button.btn.btn-quiet.btn-block', { type: 'button', onclick: editCustomer }, icon('edit'), 'Corrigir nome ou telefone'));
  }

  draw();
  sheet = openSheet({ title: 'Atendimento', body, onClose: () => { if (changed) onDone?.(); } });
  return sheet;
}

// ------------------------------------------------------------------ reserva manual

export function manualSheet(ctx, { day, customer, onDone } = {}) {
  const active = ctx.services.filter((s) => s.active);
  if (!active.length) return toast('Cadastre um serviço em Ajustes antes de reservar.', { danger: true });
  let pick = null;
  let sheet;
  const service = h('select.select', active.map((s) => h('option', { value: s.id }, `${s.name} · ${fmtMoney(s.price)}`)));
  const name = h('input.input', { type: 'text', maxlength: '80', autocomplete: 'off', value: customer?.name || '' });
  const phone = h('input.input', { type: 'tel', inputmode: 'tel', maxlength: '20', autocomplete: 'off', placeholder: '(92) 99999-9999', value: customer ? fmtPhone(customer.phone) : '' });
  const nameField = field({ label: 'Nome da cliente', control: name });
  const phoneField = field({ label: 'Telefone com DDD', control: phone });
  const chosen = h('div.notice.notice-info', { role: 'status', hidden: true });
  const pickerHost = h('div');
  const save = h('button.btn.btn-primary.btn-block', { type: 'submit', disabled: true }, 'Salvar reserva');

  function drawPicker() {
    pick = null;
    chosen.hidden = true;
    save.disabled = true;
    const svc = active.find((s) => s.id === service.value);
    mount(pickerHost, timePicker({
      store: ctx.store, settings: ctx.settings, service: svc, actor: 'owner', selected: day ? { day } : null,
      onPick: (p) => {
        pick = p;
        day = p.day;
        mount(chosen, icon('clock'), h('span', h('strong', `${fmtDayLong(p.day)}, às ${p.label}`), ` · ${svc.name}`));
        chosen.hidden = false;
        save.disabled = false;
        pickerHost.querySelectorAll('.slot').forEach((el) => el.setAttribute('aria-pressed', el.textContent === p.label ? 'true' : 'false'));
        (name.value ? save : name).focus();
      },
    }));
  }
  service.addEventListener('change', drawPicker);
  drawPicker();

  sheet = openSheet({
    title: 'Nova reserva',
    body: h('form.stack', {
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        if (!pick) return;
        nameField.setError(normalizeName(name.value) ? '' : 'Digite o nome da cliente.');
        phoneField.setError(normalizePhone(phone.value) ? '' : 'Confira o telefone: precisa ter DDD.');
        if (!normalizeName(name.value)) return name.focus();
        if (!normalizePhone(phone.value)) return phone.focus();
        busy(save, async () => {
          try {
            const b = await ctx.store.createBooking({ serviceId: service.value, day: pick.day, start: pick.start, customer: { name: name.value, phone: phone.value }, source: 'manual' });
            sheet.close();
            onDone?.(b);
            bookingSheet(ctx, { ...b }, { onDone }).body.prepend(h('div.notice.notice-ok', { role: 'status' }, icon('check'),
              h('div.stack-sm.grow', h('span', 'Reserva salva. Quer avisar a cliente?'), waButton(ctx, 'owner_confirmed', b, 'Enviar confirmação pelo WhatsApp', 'btn btn-sm'))));
          } catch (err) {
            ctx.fail(err);
            if (err.code === 'slot_taken') drawPicker();
          }
        });
      },
    }, field({ label: 'Serviço', control: service }), pickerHost, chosen, nameField, phoneField, save),
  });
  return sheet;
}

// ------------------------------------------------------------------ bloqueio rápido

export function blockSheet(ctx, { day, bookings = [], onDone } = {}) {
  let sheet;
  const date = h('input.input', { type: 'date', value: dayToIso(day || ctx.today()), min: dayToIso(ctx.today()), required: true });
  const allDay = h('input', { type: 'checkbox' });
  const from = h('input.input', { type: 'time', value: '12:00', step: '300' });
  const to = h('input.input', { type: 'time', value: '13:00', step: '300' });
  const note = h('input.input', { type: 'text', maxlength: '80', placeholder: 'Opcional. Só você vê.', autocomplete: 'off' });
  const times = h('div.grid-2', field({ label: 'Das', control: from }), field({ label: 'Até', control: to }));
  const warn = h('div.notice.notice-warn', { role: 'status', hidden: true });
  const problem = h('div.error', { role: 'alert', hidden: true });
  const save = h('button.btn.btn-primary.btn-block', { type: 'submit' }, 'Bloquear');

  const range = () => (allDay.checked ? { s: 0, e: 1440 } : { s: parseTime(from.value), e: parseTime(to.value) });
  function check() {
    times.hidden = allDay.checked;
    const d = isoToDay(date.value);
    const { s, e } = range();
    const hit = bookings.filter((b) => isLive(b) && b.day === d && s != null && e != null
      && b.start * ATOM_MIN < e && (b.start + b.n) * ATOM_MIN > s);
    warn.hidden = !hit.length;
    if (hit.length) {
      mount(warn, icon('alert'), h('span', `${hit.length === 1 ? 'Há 1 atendimento marcado' : `Há ${hit.length} atendimentos marcados`} neste período (${hit.map((b) => b.customer.name).join(', ')}). O bloqueio não cancela ninguém: remarque ou cancele pela agenda.`));
    }
  }
  for (const el of [date, allDay, from, to]) el.addEventListener('input', check);
  check();

  sheet = openSheet({
    title: 'Bloquear horário',
    body: h('form.stack', {
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const d = isoToDay(date.value);
        const { s, e: end } = range();
        problem.hidden = true;
        if (!d || s == null || end == null || s >= end) {
          problem.textContent = 'Confira a data e os horários: o início precisa ser antes do fim.';
          problem.hidden = false;
          return;
        }
        busy(save, async () => {
          try {
            await ctx.store.saveBlock({ day: d, allDay: allDay.checked, s, e: end, note: note.value });
            sheet.close();
            toast('Horário bloqueado. Ele não aparece mais para as clientes.');
            onDone?.();
          } catch (err) {
            ctx.fail(err);
          }
        });
      },
    },
      field({ label: 'Dia', control: date }),
      h('label.switch', h('span', 'Dia inteiro'), allDay, h('span.track')),
      times,
      field({ label: 'Anotação', control: note }),
      warn, problem, save),
  });
  return sheet;
}

export { errorText };
