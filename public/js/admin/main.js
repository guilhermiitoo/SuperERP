// Painel da profissional: acesso, moldura (Hoje, Agenda, Clientes, Ajustes) e navegação.

import { createAppStore, isDemo } from '../boot.js';
import { h, mount, field, busy } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast, watchConnection } from '../ui/overlay.js';
import { errorText } from '../ui/text.js';
import { applyTheme } from '../core/theme.js';
import { todayOf } from '../core/schedule.js';
import { defaultSettings } from '../core/settings.js';
import { SEGMENTS } from '../core/templates.js';
import { normalizePhone } from '../core/validate.js';
import { resetDemo } from '../data/demo.js';
import { renderHoje } from './hoje.js';
import { renderAgenda } from './agenda.js';
import { renderClientes } from './clientes.js';
import { renderAjustes } from './ajustes.js';

const app = document.getElementById('app');
const TABS = [
  ['hoje', 'Hoje', 'today', renderHoje],
  ['agenda', 'Agenda', 'calendar', renderAgenda],
  ['clientes', 'Clientes', 'users', renderClientes],
  ['ajustes', 'Ajustes', 'sliders', renderAjustes],
];

/** Estado compartilhado pelas telas do painel. */
export const ctx = {
  store: null,
  settings: null,
  services: [],
  user: null,
  isDemo,
  pending: 0,
  today: () => todayOf(ctx.store.now(), ctx.settings.utcOffsetMin),
  /** Recarrega configuração e serviços (depois de salvar em Ajustes). */
  async refreshBusiness() {
    const [{ settings }, services] = await Promise.all([ctx.store.loadBusiness(), ctx.store.listServices()]);
    ctx.settings = settings;
    ctx.services = services;
    if (settings) applyTheme(document.documentElement, settings.business.accent);
  },
  setPending(n) {
    ctx.pending = n;
    const tab = app.querySelector('.tab[data-tab="hoje"]');
    if (!tab) return;
    tab.querySelector('.tab-badge')?.remove();
    if (n) tab.append(h('span.tab-badge', { 'aria-label': `${n} aguardando aprovação` }, String(n)));
  },
  reload: () => route(),
  go: (hash) => { if (location.hash === hash) route(); else location.hash = hash; },
  fail: (err) => toast(errorText(err), { danger: true }),
};

let navSeq = 0;

// ------------------------------------------------------------------ acesso

function plain(...children) {
  mount(app,
    isDemo ? h('div.demo-flag', { role: 'note' }, h('span', 'Demonstração · dados fictícios'), h('a', { href: './' }, 'Ver como cliente')) : null,
    h('header.topbar', h('div.topbar-in', h('div.topbar-name', ctx.settings?.business.name || 'Agenda'))),
    h('main#conteudo.login', { tabindex: '-1' }, children));
}

function viewLogin(message) {
  if (isDemo) {
    const enter = h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => busy(enter, async () => { await ctx.store.signIn('demo', 'demo'); await afterSignIn(); }) }, 'Entrar na demonstração');
    return plain(
      h('h1', 'Painel da profissional'),
      h('p.muted', 'Esta é uma demonstração: não há senha e os dados ficam só neste navegador. Em uma instalação real, a entrada é com e-mail e senha.'),
      enter);
  }
  const email = h('input.input', { type: 'email', name: 'email', autocomplete: 'username', inputmode: 'email', required: true });
  const password = h('input.input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const problem = h('div.notice.notice-danger', { role: 'alert', hidden: !message }, icon('alert'), h('span', message || ''));
  const info = h('div.notice.notice-ok', { role: 'status', hidden: true });
  const submit = h('button.btn.btn-primary.btn-block', { type: 'submit' }, 'Entrar');
  const show = (el, text, name) => { mount(el, icon(name), h('span', text)); el.hidden = false; };

  const form = h('form.stack', {
    novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      problem.hidden = true;
      info.hidden = true;
      if (!email.value.trim() || !password.value) return show(problem, 'Digite o e-mail e a senha.', 'alert');
      return busy(submit, async () => {
        try {
          await ctx.store.signIn(email.value, password.value);
          await afterSignIn();
        } catch (err) {
          show(problem, errorText(err), 'alert');
        }
      });
    },
  },
    field({ label: 'E-mail', control: email }),
    field({ label: 'Senha', control: password }),
    problem, info, submit,
    h('button.btn.btn-quiet.btn-block', {
      type: 'button',
      onclick: async (e) => {
        problem.hidden = true;
        info.hidden = true;
        if (!email.value.trim()) { show(problem, 'Digite seu e-mail acima e toque de novo em "Esqueci minha senha".', 'alert'); return email.focus(); }
        await busy(e.currentTarget, async () => {
          try {
            await ctx.store.sendReset(email.value);
            show(info, 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também a caixa de spam.', 'check');
          } catch (err) {
            show(problem, errorText(err), 'alert');
          }
        });
        return undefined;
      },
    }, 'Esqueci minha senha'));
  plain(h('h1', 'Entrar no painel'), form);
  email.focus();
}

function viewNoAccess() {
  plain(
    h('h1', 'Conta sem acesso'),
    h('div.notice.notice-warn', icon('key'), h('span', 'Esta conta existe, mas ainda não foi liberada como proprietária desta agenda. Envie o código abaixo para quem fez a instalação.')),
    h('div.field', h('span.label', 'Código da conta'), h('input.input', { readonly: true, value: ctx.user.uid, 'aria-label': 'Código da conta', onfocus: (e) => e.target.select() })),
    h('p.fine', ctx.user.email),
    h('button.btn.btn-block', { type: 'button', onclick: async () => { await ctx.store.signOut(); viewLogin(); } }, 'Sair'));
}

/** Primeira abertura: cria a configuração inicial a partir de um modelo. */
function viewSetup() {
  const name = h('input.input', { type: 'text', maxlength: '60', required: true, autocomplete: 'organization' });
  const phone = h('input.input', { type: 'tel', inputmode: 'tel', maxlength: '20', placeholder: '(92) 99999-9999' });
  const segment = h('select.select', Object.entries(SEGMENTS).map(([k, s]) => h('option', { value: k }, s.label)));
  const nameField = field({ label: 'Nome do negócio', control: name });
  const phoneField = field({ label: 'WhatsApp do negócio', hint: 'As clientes usam este número para falar com você.', control: phone });
  const submit = h('button.btn.btn-primary.btn-block', { type: 'submit' }, 'Criar minha agenda');
  plain(
    h('h1', 'Vamos configurar sua agenda'),
    h('p.muted', 'Leva um minuto. Depois você ajusta serviços, preços e horários em Ajustes.'),
    h('form.stack', {
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        nameField.setError(name.value.trim() ? '' : 'Digite o nome do negócio.');
        const digits = normalizePhone(phone.value);
        phoneField.setError(!phone.value.trim() || digits ? '' : 'Confira o telefone: precisa ter DDD.');
        if (!name.value.trim() || (phone.value.trim() && !digits)) return undefined;
        return busy(submit, async () => {
          try {
            const seg = SEGMENTS[segment.value];
            const base = defaultSettings();
            await ctx.store.saveSettings({ ...base, business: { ...base.business, name: name.value, phone: digits, accent: seg.accent } });
            for (const [i, s] of seg.services.entries()) await ctx.store.saveService({ ...s, order: i + 1 });
            await ctx.store.syncDays();
            await ctx.refreshBusiness();
            startShell();
          } catch (err) {
            ctx.fail(err);
          }
        });
      },
    }, nameField, phoneField, field({ label: 'Tipo de negócio', hint: 'Usamos para sugerir os primeiros serviços.', control: segment }), submit));
  name.focus();
}

async function afterSignIn() {
  ctx.user = await ctx.store.currentUser();
  if (!ctx.user) return viewLogin();
  let owner;
  try {
    owner = await ctx.store.isOwner();
  } catch (err) {
    return viewLogin(errorText(err));
  }
  if (!owner) return viewNoAccess();
  await ctx.refreshBusiness();
  if (!ctx.settings) return viewSetup();
  return startShell();
}

// ------------------------------------------------------------------ moldura e navegação

function shell() {
  const current = (location.hash.split('/')[1] || 'hoje');
  const main = h('main#conteudo.view', { tabindex: '-1' });
  const root = h('div.shell',
    h('header.topbar', h('div.topbar-in',
      h('div.topbar-name', ctx.settings.business.name),
      h('a.btn.btn-quiet.btn-icon', { href: './', target: '_blank', rel: 'noopener', 'aria-label': 'Abrir a página de agendamento das clientes' }, icon('link')))),
    main,
    h('nav.tabbar', { 'aria-label': 'Seções do painel' }, TABS.map(([key, label, ico]) => h('a.tab', {
      href: `#/${key}`, dataset: { tab: key }, 'aria-current': key === current ? 'page' : null,
    }, icon(ico), h('span', label)))));
  mount(app, isDemo ? h('div.demo-flag', { role: 'note' }, h('span', 'Demonstração · dados fictícios'),
    h('button', { type: 'button', onclick: () => { resetDemo(localStorage); location.href = './painel.html'; } }, 'Recomeçar')) : null, root);
  watchConnection(app, (online) => { if (online) route(); });
  ctx.setPending(ctx.pending);
  return main;
}

async function route() {
  const seq = ++navSeq;
  const [, tab = 'hoje', ...rest] = location.hash.split('/');
  const entry = TABS.find(([key]) => key === tab) || TABS[0];
  const main = shell();
  const alive = () => seq === navSeq;
  try {
    await entry[3](ctx, main, rest, alive);
  } catch (err) {
    if (!alive()) return;
    mount(main, h('div.notice.notice-danger', { role: 'alert' }, icon('offline'), h('span', errorText(err))),
      h('button.btn.btn-primary', { type: 'button', onclick: route }, 'Tentar de novo'));
  }
}

let started = false;
function startShell() {
  if (!location.hash || location.hash === '#/') history.replaceState(null, '', '#/hoje');
  route();
  if (started) return;
  started = true;
  addEventListener('hashchange', () => { route().then(() => { scrollTo({ top: 0 }); app.querySelector('h1')?.focus?.(); }); });
  maintain();
}

/** Tarefas de manutenção que rodam quando o painel abre (não há servidor para fazê-las). */
async function maintain() {
  try {
    const swept = await ctx.store.sweepExpired();
    const synced = await ctx.store.syncDays();
    if (swept.expired || synced.created || synced.updated) route();
  } catch {
    // sem conexão agora: tenta de novo na próxima abertura
  }
}

async function start() {
  try {
    ctx.store = await createAppStore();
    if (isDemo) {
      const { settings } = await ctx.store.loadBusiness();
      ctx.settings = settings;
      if (settings) applyTheme(document.documentElement, settings.business.accent);
    }
    await afterSignIn();
  } catch (err) {
    mount(app, h('main.login', h('h1', 'Não foi possível abrir'), h('div.notice.notice-danger', { role: 'alert' }, icon('offline'), h('span', errorText(err))),
      h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => location.reload() }, 'Tentar de novo')));
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

start();
