// Área pública: a cliente escolhe serviço, dia e horário, informa nome e telefone e confirma.
// Nada é mostrado como reservado antes de o servidor gravar.

import { createAppStore, isDemo } from '../boot.js';
import { h, mount, field, busy, downloadText, copyText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { leaf } from '../ui/leaf.js';
import { timePicker } from '../ui/timepicker.js';
import { openSheet, confirmSheet, toast, watchConnection } from '../ui/overlay.js';
import { STATUS_LABEL, STATUS_CHIP, errorText } from '../ui/text.js';
import { applyTheme } from '../core/theme.js';
import { ATOM_MIN, fmtDayLong, fmtDayShort, fmtDuration, fmtMoney, fmtTime, localOf } from '../core/time.js';
import { periodsOf, todayOf } from '../core/schedule.js';
import { canCustomerCancel, canCustomerReschedule } from '../core/booking.js';
import { normalizeName, normalizePhone, fmtPhone } from '../core/validate.js';
import { waLink, messageFor } from '../core/whatsapp.js';
import { buildIcs } from '../core/ics.js';
import { notifier } from '../core/notify.js';

const app = document.getElementById('app');
let store;
let settings;
let services = [];
let picker = null;
let submitting = false;
const flow = { step: 'service', serviceId: null, day: null, start: null, name: '', phone: '', booking: null, notice: null, after: null };

const service = () => services.find((s) => s.id === flow.serviceId);
const manageLink = (token) => `${location.origin}${location.pathname}#/r/${token}`;
const ctxFor = (b) => ({ business: settings.business, offsetMin: settings.utcOffsetMin, link: manageLink(b.token), nowMs: store.now() });
const timeOf = (b) => localOf(b.startAt, settings.utcOffsetMin);

function price(cents) {
  return h('span.price', { 'aria-label': fmtMoney(cents) }, h('small', { 'aria-hidden': 'true' }, 'R$'), h('span', { 'aria-hidden': 'true' }, fmtMoney(cents).slice(3)));
}

// ------------------------------------------------------------------ moldura

function hoursToday() {
  const today = todayOf(store.now(), settings.utcOffsetMin);
  const periods = periodsOf(settings, today);
  if (!periods.length) return 'Hoje: fechado';
  return `Hoje: ${periods.map((p) => `${fmtTime(p.s)} às ${fmtTime(p.e)}`).join(' e ')}`;
}

function frame(content, { small = false } = {}) {
  const b = settings?.business || { name: 'Agendamento' };
  const head = h(`header.band${small ? '.band-sm' : ''}`, h('div.band-in',
    b.logo ? h('img.band-logo', { src: b.logo, alt: '' }) : null,
    h('div', h(small ? 'a.band-name' : 'div.band-name', small ? { href: '#/' } : null, b.name), !small && b.tagline ? h('p.band-tag', b.tagline) : null)));
  const where = !small && settings ? h('div.where',
    b.address ? h('div', icon('pin'), h('span', b.address)) : null,
    h('div', icon('clock'), h('span', hoursToday()))) : null;
  const main = h('main#conteudo.page', { tabindex: '-1' }, content);
  const foot = h('footer.foot',
    h('button', { type: 'button', onclick: showPrivacy }, 'Aviso de privacidade'),
    h('span', 'Agenda Base'));
  mount(app,
    isDemo ? h('div.demo-flag', { role: 'note' }, h('span', 'Demonstração · dados fictícios'), h('a', { href: './painel.html' }, 'Abrir o painel')) : null,
    head, where, main, settings ? foot : null);
  watchConnection(app, (online) => { if (online) picker?.refresh(); });
}

function go(step, { focus = true } = {}) {
  flow.step = step;
  render();
  if (focus) focusTop();
}

function focusTop() {
  scrollTo({ top: 0 });
  app.querySelector('h1')?.focus?.();
}

function showPrivacy() {
  openSheet({
    title: 'Aviso de privacidade',
    body: [h('p', { style: { whiteSpace: 'pre-line' } }, settings.privacy?.text || ''), isDemo ? h('p.small.muted', 'Na demonstração, os dados ficam só neste navegador.') : null],
  });
}

// ------------------------------------------------------------------ passo 1: serviço

function viewService() {
  if (settings.rules.paused) {
    const url = waLink(settings.business.phone, 'Olá! Gostaria de agendar um horário.');
    return frame([
      h('h1', { tabindex: '-1' }, 'Agendamentos pausados'),
      h('div.notice.notice-warn', icon('pause'), h('span', 'No momento não estamos recebendo novos agendamentos pelo link. Quem já tem horário marcado continua com ele.')),
      url ? h('a.btn.btn-primary.btn-block', { href: url, target: '_blank', rel: 'noopener' }, icon('chat'), 'Falar pelo WhatsApp') : null,
    ]);
  }
  if (!services.length) {
    return frame([h('div.empty', icon('tag'), h('strong', 'Nenhum serviço disponível'), h('span', 'Volte mais tarde ou fale com o estabelecimento.'))]);
  }
  frame([
    flow.notice ? h('div.notice.notice-warn', { role: 'alert' }, icon('alert'), h('span', flow.notice)) : null,
    h('h1', { tabindex: '-1' }, 'Escolha o serviço'),
    h('ul.plist', services.map((s) => h('li', h('button.prow', {
      type: 'button',
      'aria-pressed': flow.serviceId === s.id ? 'true' : 'false',
      onclick: () => { flow.serviceId = s.id; flow.start = null; flow.notice = null; go('time'); },
    },
      h('span.grow', h('span.prow-title', s.name), s.description ? h('div.prow-sub', s.description) : null, h('div.prow-sub', fmtDuration(s.duration))),
      h('span.prow-end', price(s.price)),
      icon('right'))))),
  ]);
}

// ------------------------------------------------------------------ passo 2: dia e horário

function pickRow() {
  const s = service();
  return h('div.pick',
    h('div.pick-main', h('div.pick-title', s.name), h('div.pick-sub', `${fmtDuration(s.duration)} · ${fmtMoney(s.price)}`)),
    h('button.btn.btn-quiet.btn-sm', { type: 'button', onclick: () => go('service') }, 'Trocar'));
}

function viewTime() {
  const s = service();
  if (!s) return go('service');
  picker = timePicker({
    store, settings, service: s, actor: 'public',
    selected: flow.start != null ? { day: flow.day, start: flow.start } : flow.day ? { day: flow.day } : null,
    onPick: (p) => { flow.day = p.day; flow.start = p.start; flow.notice = null; go('details'); },
  });
  frame([
    h('div.row.between', h('button.btn.btn-quiet.btn-sm.back', { type: 'button', onclick: () => go('service') }, icon('left'), 'Serviços'), h('span.steps', 'Passo 2 de 3')),
    h('h1', { tabindex: '-1' }, 'Escolha o dia e o horário'),
    flow.notice ? h('div.notice.notice-warn', { role: 'alert' }, icon('alert'), h('span', flow.notice)) : null,
    pickRow(),
    picker,
  ]);
}

// ------------------------------------------------------------------ passo 3: dados e resumo

function ticket(day, start, s) {
  const from = start * ATOM_MIN;
  return h('div.ticket',
    leaf(day, { on: true }),
    h('div.ticket-main',
      h('div.ticket-time', fmtTime(from), h('small', `até ${fmtTime(from + s.duration)}`)),
      h('div.ticket-svc', s.name),
      h('div.muted.small', `${fmtDayLong(day)} · `, h('span.nowrap', fmtMoney(s.price)))));
}

function policyText() {
  const mins = settings.rules.cancelLimitMin;
  if (!mins) return 'Você pode cancelar ou remarcar pelo link da reserva até o horário do atendimento.';
  const amount = mins % 1440 === 0 ? `${mins / 1440} ${mins === 1440 ? 'dia' : 'dias'}` : mins % 60 === 0 ? `${mins / 60} ${mins === 60 ? 'hora' : 'horas'}` : `${mins} minutos`;
  return `Você pode cancelar ou remarcar pelo link da reserva até ${amount} antes do horário.`;
}

function viewDetails() {
  const s = service();
  if (!s || flow.start == null) return go('time');
  const approval = settings.rules.mode === 'approval';
  const name = h('input.input', { type: 'text', name: 'name', autocomplete: 'name', autocapitalize: 'words', maxlength: '80', value: flow.name, required: true, oninput: (e) => { flow.name = e.target.value; } });
  const phone = h('input.input', {
    type: 'tel', name: 'phone', inputmode: 'tel', autocomplete: 'tel-national', maxlength: '20', placeholder: '(92) 99999-9999', value: flow.phone, required: true,
    oninput: (e) => { flow.phone = e.target.value; },
    onblur: (e) => { const d = normalizePhone(e.target.value); if (d) { e.target.value = fmtPhone(d); flow.phone = e.target.value; } },
  });
  const nameField = field({ label: 'Seu nome', control: name });
  const phoneField = field({ label: 'Telefone com DDD (WhatsApp)', hint: 'Usamos só para falar com você sobre este horário.', control: phone });
  const trap = h('input.hp', { type: 'text', name: 'site', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const problem = h('div.notice.notice-danger', { role: 'alert', hidden: true });
  const button = h('button.btn.btn-primary.btn-block', { type: 'submit' }, approval ? 'Enviar solicitação' : 'Confirmar agendamento');

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const cleanName = normalizeName(name.value);
    const cleanPhone = normalizePhone(phone.value);
    nameField.setError(cleanName ? '' : errorText({ code: 'invalid_name' }));
    phoneField.setError(cleanPhone ? '' : errorText({ code: 'invalid_phone' }));
    problem.hidden = true;
    if (!cleanName) return name.focus();
    if (!cleanPhone) return phone.focus();
    if (trap.value) return; // preenchido por robô
    if (tooManyHere()) {
      mount(problem, icon('alert'), h('span', 'Você já fez vários agendamentos em pouco tempo. Aguarde alguns minutos ou fale com o estabelecimento.'));
      problem.hidden = false;
      return;
    }
    submitting = true;
    try {
      await busy(button, async () => {
        const b = await store.createBooking({ serviceId: s.id, day: flow.day, start: flow.start, customer: { name: cleanName, phone: cleanPhone } });
        flow.booking = b;
        countHere();
        notifier.notify(b.status === 'pending' ? 'booking_pending' : 'booking_created', b);
        Object.assign(flow, { start: null, notice: null, after: 'created' });
        location.hash = `#/r/${b.token}`;
      });
    } catch (err) {
      await onCreateError(err, problem);
    } finally {
      submitting = false;
    }
  }

  frame([
    h('div.row.between', h('button.btn.btn-quiet.btn-sm.back', { type: 'button', onclick: () => go('time') }, icon('left'), 'Horários'), h('span.steps', 'Passo 3 de 3')),
    h('h1', { tabindex: '-1' }, 'Confira e confirme'),
    h('div.stack-sm', ticket(flow.day, flow.start, s),
      h('button.btn.btn-quiet.btn-sm', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => go('time') }, 'Trocar dia ou horário')),
    h('form.stack', { novalidate: true, onsubmit: onSubmit },
      nameField, phoneField, trap,
      approval ? h('div.notice.notice-warn', icon('hourglass'), h('span', h('strong', 'Este horário precisa de aprovação. '), 'Você envia a solicitação e o estabelecimento confirma. Enquanto isso, o horário fica reservado para você.')) : null,
      problem,
      button,
      h('p.small.muted', policyText())),
  ]);
}

async function onCreateError(err, problem) {
  const code = err?.code;
  if (code === 'slot_taken' || code === 'too_soon' || code === 'too_far') {
    flow.notice = errorText(err);
    flow.start = null;
    return go('time');
  }
  if (code === 'paused' || code === 'service_unavailable' || code === 'not_ready') {
    try { await loadBusiness(); } catch { /* mantém o que já está na tela */ }
    flow.notice = errorText(err);
    return go('service');
  }
  const text = code === 'offline'
    ? 'Sem conexão com o servidor. Seu horário ainda NÃO foi reservado. Verifique a internet e toque em confirmar de novo.'
    : `${errorText(err)} Seu horário ainda não foi reservado.`;
  mount(problem, icon(code === 'offline' ? 'offline' : 'alert'), h('span', text));
  problem.hidden = false;
  problem.scrollIntoView({ block: 'center' });
}

// controle simples contra uso abusivo a partir de um mesmo navegador (o servidor valida o restante)
const RECENT_KEY = 'agenda-base-recentes';
function recentHere() {
  try { return JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]').filter((t) => Date.now() - t < 600000); } catch { return []; }
}
const tooManyHere = () => recentHere().length >= 3;
function countHere() {
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify([...recentHere(), Date.now()])); } catch { /* sem armazenamento */ }
}

// ------------------------------------------------------------------ a reserva (confirmação e gerenciamento)

const HEADLINE = {
  confirmed: 'Seu horário está confirmado',
  pending: 'Solicitação enviada',
  cancelled: 'Reserva cancelada',
  declined: 'Solicitação recusada',
  expired: 'Solicitação expirada',
  done: 'Atendimento concluído',
  noshow: 'Horário não utilizado',
};
const MARK = { confirmed: ['check', ''], pending: ['hourglass', '.is-wait'], done: ['check', ''] };

function deadlineText(ms) {
  const { day, minutes } = localOf(ms, settings.utcOffsetMin);
  return `${fmtDayShort(day)} às ${fmtTime(minutes)}`;
}

function stateNotice(b) {
  const state = b.effectiveStatus;
  if (state === 'pending') {
    return h('div.notice.notice-warn', { role: 'status' }, icon('hourglass'), h('span', h('strong', 'Ainda não está confirmado. '),
      `O estabelecimento responde até ${deadlineText(b.expiresAt)}. O horário fica reservado para você até lá. Guarde este link para acompanhar.`));
  }
  if (state === 'expired') return h('div.notice', icon('info'), h('span', 'A solicitação não foi respondida a tempo e o horário foi liberado. Você pode fazer um novo agendamento.'));
  if (state === 'declined') return h('div.notice', icon('info'), h('span', 'O estabelecimento não pôde atender neste horário. Você pode escolher outro.'));
  if (state === 'cancelled') return h('div.notice', icon('info'), h('span', b.endedBy === 'owner' ? 'O estabelecimento cancelou este horário.' : 'Você cancelou este horário.'));
  return null;
}

function bookingView(b) {
  const state = b.effectiveStatus;
  const { day, minutes } = timeOf(b);
  const active = state === 'confirmed' || state === 'pending';
  const [markIcon, markClass] = MARK[state] || ['x', '.is-off'];
  const now = store.now();
  const canMove = canCustomerReschedule(b, now);
  const canCancel = canCustomerCancel(b, now);
  const after = flow.after;
  flow.after = null;

  const kind = after === 'rescheduled' ? 'customer_rescheduled' : after === 'cancelled' ? 'customer_cancelled' : state === 'pending' ? 'customer_pending' : 'customer_confirmed';
  const wa = (active || after === 'cancelled') ? waLink(settings.business.phone, messageFor(kind, b, ctxFor(b))) : null;
  const link = manageLink(b.token);
  const linkInput = h('input.input', { type: 'text', readonly: true, value: link, 'aria-label': 'Link da sua reserva', onfocus: (e) => e.target.select() });

  const actions = [];
  if (wa) {
    actions.push(h('div.stack-sm',
      h('a.btn.btn-primary.btn-block', { href: wa, target: '_blank', rel: 'noopener' }, icon('chat'), after === 'cancelled' ? 'Avisar o cancelamento pelo WhatsApp' : 'Avisar pelo WhatsApp'),
      h('p.small.muted.center', 'Abre o WhatsApp com a mensagem pronta. Você precisa tocar em enviar.')));
  }
  if (active) {
    actions.push(h('button.btn.btn-block', { type: 'button', onclick: () => downloadText('agendamento.ics', buildIcs(b, ctxFor(b)), 'text/calendar;charset=utf-8') }, icon('calendar'), 'Adicionar ao calendário'));
    actions.push(h('div.stack-sm',
      h('span.label', 'Link da sua reserva'),
      h('div.linkbox', linkInput, h('button.btn.btn-icon', { type: 'button', 'aria-label': 'Copiar link', onclick: async () => toast((await copyText(link)) ? 'Link copiado.' : 'Não foi possível copiar. Selecione o link e copie.') }, icon('copy'))),
      h('p.small.muted', 'Com este link você vê, remarca ou cancela. Guarde-o: ele não é enviado por mensagem automática.')));
  }
  if (canMove) actions.push(h('button.btn.btn-block', { type: 'button', onclick: () => reschedule(b) }, icon('swap'), 'Remarcar'));
  if (canCancel) actions.push(h('button.btn.btn-danger.btn-block', { type: 'button', onclick: () => cancel(b) }, 'Cancelar reserva'));
  if (active && (!canMove || !canCancel) && state === 'confirmed') {
    actions.push(h('p.small.muted', 'O prazo para remarcar ou cancelar pelo link já passou. Se precisar, fale com o estabelecimento.'));
  }
  actions.push(h('a.btn.btn-quiet.btn-block', { href: '#/', onclick: () => { flow.step = 'service'; flow.booking = null; } }, active ? 'Fazer outro agendamento' : 'Fazer um novo agendamento'));

  frame([
    h('div.done-head',
      h('div.stamp', leaf(day, { large: true, on: active }), h(`span.stamp-mark${markClass}`, icon(markIcon))),
      h('div.stack-sm',
        h('h1', { tabindex: '-1' }, state !== 'confirmed' ? HEADLINE[state] : after === 'rescheduled' ? 'Horário remarcado' : after === 'created' ? 'Agendamento confirmado' : HEADLINE[state]),
        h('p.muted', `${fmtDayLong(day)}, às ${fmtTime(minutes)}`),
        h('div', h(`span.chip.${STATUS_CHIP[state]}`, STATUS_LABEL[state])))),
    stateNotice(b),
    h('dl.facts.card',
      h('div', h('dt', 'Serviço'), h('dd', b.service.name)),
      h('div', h('dt', 'Horário'), h('dd.num', `${fmtTime(minutes)} às ${fmtTime(minutes + b.service.duration)}`)),
      h('div', h('dt', 'Valor'), h('dd.num', fmtMoney(b.service.price))),
      h('div', h('dt', 'Nome'), h('dd', b.customer.name)),
      settings.business.address ? h('div', h('dt', 'Onde'), h('dd', settings.business.address)) : null),
    h('div.stack', actions),
  ], { small: true });
}

async function viewManage(token) {
  frame([h('div.stack', { 'aria-busy': 'true' }, h('div.skeleton', { style: { height: '9rem' } }), h('div.skeleton', { style: { height: '12rem' } }), h('p.sr-only', 'Carregando sua reserva…'))], { small: true });
  let b;
  try {
    b = flow.booking?.token === token && flow.after ? flow.booking : await store.getBooking(token);
  } catch (err) {
    return frame([
      h('h1', { tabindex: '-1' }, 'Não foi possível carregar'),
      h('div.notice.notice-danger', { role: 'alert' }, icon('offline'), h('span', errorText(err))),
      h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => viewManage(token) }, 'Tentar de novo'),
    ], { small: true });
  }
  if (!b) {
    return frame([
      h('div.empty', icon('search'), h('h1', { tabindex: '-1' }, 'Não encontramos esta reserva'), h('span', 'Confira se o link está completo. Se a reserva foi apagada, faça um novo agendamento.')),
      h('a.btn.btn-primary.btn-block', { href: '#/' }, 'Fazer um agendamento'),
    ], { small: true });
  }
  flow.booking = b;
  bookingView(b);
  focusTop();
}

function reschedule(b) {
  let sheet;
  const svc = { ...b.service, active: true };
  const body = timePicker({
    store, settings, service: svc, actor: 'public',
    selected: { day: b.day, start: b.start }, exclude: { day: b.day, start: b.start, n: b.n },
    onPick: async (p) => {
      const ok = await confirmSheet({ title: 'Remarcar?', text: `Seu horário passa para ${fmtDayLong(p.day)}, às ${p.label}.${b.mode === 'approval' ? ' O novo horário precisa de aprovação.' : ''}`, confirmLabel: 'Remarcar' });
      if (!ok) return;
      try {
        flow.booking = await store.rescheduleBooking(b.token, { day: p.day, start: p.start }, 'customer');
        flow.after = 'rescheduled';
        notifier.notify('booking_rescheduled', flow.booking);
        sheet.close();
        bookingView(flow.booking);
        focusTop();
      } catch (err) {
        toast(errorText(err), { danger: true });
        if (err.code === 'slot_taken') body.refresh();
      }
    },
  });
  sheet = openSheet({ title: 'Escolha o novo horário', body });
}

async function cancel(b) {
  const ok = await confirmSheet({ title: 'Cancelar a reserva?', text: 'O horário será liberado para outras pessoas. Esta ação não pode ser desfeita.', confirmLabel: 'Cancelar reserva', cancelLabel: 'Manter', danger: true });
  if (!ok) return;
  try {
    flow.booking = await store.cancelBooking(b.token, 'customer');
    flow.after = 'cancelled';
    notifier.notify('booking_cancelled', flow.booking);
    bookingView(flow.booking);
    focusTop();
  } catch (err) {
    toast(errorText(err), { danger: true });
  }
}

// ------------------------------------------------------------------ início

function render() {
  picker = null;
  const m = /^#\/r\/([A-Za-z0-9_-]{20,64})$/.exec(location.hash);
  if (m) return viewManage(m[1]);
  if (location.hash.startsWith('#/r/')) return viewManage('invalido');
  if (flow.step === 'time') return viewTime();
  if (flow.step === 'details') return viewDetails();
  return viewService();
}

async function loadBusiness() {
  const data = await store.loadBusiness();
  settings = data.settings;
  services = data.services;
  if (settings) {
    const theme = applyTheme(document.documentElement, settings.business.accent);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.accent);
    document.title = `Agendar · ${settings.business.name}`;
  }
}

async function start() {
  try {
    store = await createAppStore();
    await loadBusiness();
  } catch (err) {
    mount(app, h('main.page', h('h1', 'Não foi possível abrir'), h('div.notice.notice-danger', { role: 'alert' }, icon('offline'), h('span', errorText(err))),
      h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => location.reload() }, 'Tentar de novo')));
    return;
  }
  if (!settings) {
    mount(app, h('main.page', h('div.empty', icon('clock'), h('h1', 'Este link ainda não está pronto'), h('span', 'O estabelecimento ainda está configurando a agenda. Volte em breve.'))));
    return;
  }
  render();
  addEventListener('hashchange', () => { render(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && picker && Date.now() - picker.loadedAt() > 60000) picker.refresh();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

start();
