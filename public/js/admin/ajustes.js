// Ajustes: tudo o que muda de um negócio para outro é configurado aqui, sem mexer em código.

import { h, mount, field, busy, copyText, downloadText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, confirmSheet, toast } from '../ui/overlay.js';
import { errorText } from '../ui/text.js';
import { WEEKDAYS, dayToIso, fmtDayLong, fmtDuration, fmtMoney, fmtTime, isoToDay, parseTime } from '../core/time.js';
import { ACCENTS, TIMEZONES } from '../core/templates.js';
import { themeFrom } from '../core/theme.js';
import { fmtPhone } from '../core/validate.js';
import { blockRow, blockSheet, publicUrl } from './common.js';

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const backLink = () => h('a.btn.btn-quiet.btn-sm', { href: '#/ajustes', style: { alignSelf: 'flex-start', marginLeft: '-0.75rem' } }, icon('left'), 'Ajustes');
const select = (options, value) => h('select.select', options.map(([v, label]) => h('option', { value: String(v), selected: String(v) === String(value) }, label)));

/** Salva a configuração e, se o expediente mudou, atualiza os dias já publicados. */
async function saveSettings(ctx, patch, { resync = false, button, done = 'Salvo.' } = {}) {
  return busy(button, async () => {
    try {
      await ctx.store.saveSettings({ ...ctx.settings, ...patch });
      if (resync) await ctx.store.syncDays();
      await ctx.refreshBusiness();
      toast(done);
      return true;
    } catch (err) {
      toast(errorText(err), { danger: true });
      return false;
    }
  });
}

// ------------------------------------------------------------------ início dos ajustes

function home(ctx, main) {
  const r = ctx.settings.rules;
  const url = publicUrl();
  const open = h('input', { type: 'checkbox', checked: !r.paused });
  open.addEventListener('change', async () => {
    const paused = !open.checked;
    const ok = await saveSettings(ctx, { rules: { ...r, paused } }, { button: open, done: paused ? 'Agendamentos pelo link pausados.' : 'Agendamentos pelo link reativados.' });
    if (!ok) open.checked = !open.checked;
    ctx.reload();
  });
  const row = (hash, ico, title, sub) => h('a.setting-row', { href: hash }, icon(ico), h('span.grow', h('div.prow-title', title), h('div.prow-sub', sub)), icon('right'));
  const activeCount = ctx.services.filter((s) => s.active).length;

  mount(main,
    h('h1', { tabindex: '-1' }, 'Ajustes'),
    h('section',
      h('div.card', h('label.switch', h('span', h('div.strong', 'Receber agendamentos pelo link'),
        h('div.small.muted', r.paused ? 'Pausado: ninguém consegue reservar. As reservas existentes continuam valendo.' : 'Ativo: as clientes podem reservar.')), open, h('span.track')))),
    h('section', { 'aria-label': 'Link de agendamento' },
      h('h2', 'Seu link de agendamento'),
      h('div.card.stack-sm',
        h('div.row', h('input.input', { readonly: true, value: url, 'aria-label': 'Link de agendamento', onfocus: (e) => e.target.select() }),
          h('button.btn.btn-icon', { type: 'button', 'aria-label': 'Copiar link', onclick: async () => toast((await copyText(url)) ? 'Link copiado.' : 'Não foi possível copiar.') }, icon('copy'))),
        navigator.share ? h('button.btn.btn-block', { type: 'button', onclick: () => navigator.share({ title: ctx.settings.business.name, text: 'Agende seu horário:', url }).catch(() => {}) }, icon('share'), 'Compartilhar') : null,
        h('p.small.muted', 'Envie este link pelo WhatsApp ou coloque na bio do Instagram.'))),
    h('section',
      h('div.plist',
        row('#/ajustes/servicos', 'tag', 'Serviços', `${activeCount} ${activeCount === 1 ? 'ativo' : 'ativos'}`),
        row('#/ajustes/horarios', 'clock', 'Horários de atendimento', 'Dias da semana e pausas'),
        row('#/ajustes/datas', 'calendar', 'Folgas, datas especiais e bloqueios', 'Feriados, férias e horários diferentes'),
        row('#/ajustes/regras', 'sliders', 'Regras de agendamento', r.mode === 'auto' ? 'Confirmação automática' : 'Confirmação mediante aprovação'),
        row('#/ajustes/negocio', 'store', 'Dados do negócio', 'Nome, telefone, endereço, cor e aviso de privacidade'),
        row('#/ajustes/mensagens', 'chat', 'Mensagens', 'WhatsApp manual · automação desativada'),
        row('#/ajustes/dados', 'download', 'Exportar e importar dados', 'Cópia de segurança manual'))),
    h('section',
      h('p.fine', ctx.user?.email || ''),
      h('button.btn.btn-block', { type: 'button', onclick: async () => { await ctx.store.signOut(); location.href = './painel.html'; } }, icon('logout'), 'Sair')));
}

// ------------------------------------------------------------------ serviços

function serviceSheet(ctx, service) {
  const s = service || { name: '', description: '', price: 0, duration: 45, buffer: 10, active: true, order: ctx.services.length + 1 };
  const name = h('input.input', { type: 'text', value: s.name, maxlength: '60', required: true, autocomplete: 'off' });
  const description = h('input.input', { type: 'text', value: s.description, maxlength: '140', autocomplete: 'off' });
  const price = h('input.input', { type: 'text', inputmode: 'decimal', value: s.price ? (s.price / 100).toFixed(2).replace('.', ',') : '', placeholder: '0,00', autocomplete: 'off' });
  const durations = [15, 20, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 210, 240];
  const duration = select((durations.includes(s.duration) ? durations : [...durations, s.duration].sort((a, b) => a - b)).map((m) => [m, fmtDuration(m)]), s.duration);
  const buffer = select([0, 5, 10, 15, 20, 30].map((m) => [m, m ? `${m} min` : 'Sem intervalo']), s.buffer);
  const active = h('input', { type: 'checkbox', checked: s.active });
  const nameField = field({ label: 'Nome do serviço', control: name });
  const priceField = field({ label: 'Preço (R$)', control: price });
  const problem = h('div.error', { role: 'alert', hidden: true });
  const save = h('button.btn.btn-primary.btn-block', { type: 'submit' }, 'Salvar serviço');
  let sheet;
  const remove = service ? h('button.btn.btn-danger.btn-block', {
    type: 'button',
    onclick: async () => {
      if (!(await confirmSheet({ title: 'Excluir serviço?', text: `"${s.name}" deixa de existir. As reservas já feitas continuam com os dados delas. Se quiser só esconder, desative em vez de excluir.`, confirmLabel: 'Excluir', danger: true }))) return;
      try { await ctx.store.deleteService(s.id); await ctx.refreshBusiness(); sheet.close(); ctx.reload(); toast('Serviço excluído.'); } catch (err) { ctx.fail(err); }
    },
  }, 'Excluir serviço') : null;

  sheet = openSheet({
    title: service ? 'Editar serviço' : 'Novo serviço',
    body: h('form.stack', {
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const cents = Math.round(Number(price.value.replace(/\./g, '').replace(',', '.')) * 100);
        nameField.setError(name.value.trim() ? '' : 'Digite o nome do serviço.');
        priceField.setError(Number.isFinite(cents) && cents >= 0 && price.value.trim() ? '' : 'Digite o preço, por exemplo 35,00.');
        if (!name.value.trim()) return name.focus();
        if (!Number.isFinite(cents) || cents < 0 || !price.value.trim()) return price.focus();
        problem.hidden = true;
        busy(save, async () => {
          try {
            await ctx.store.saveService({ ...s, name: name.value, description: description.value, price: cents, duration: Number(duration.value), buffer: Number(buffer.value), active: active.checked });
            await ctx.refreshBusiness();
            sheet.close();
            ctx.reload();
            toast('Serviço salvo. Reservas já feitas não mudam.');
          } catch (err) {
            problem.textContent = errorText(err);
            problem.hidden = false;
          }
        });
      },
    },
      nameField,
      field({ label: 'Descrição curta', hint: 'Opcional. Aparece abaixo do nome para a cliente.', control: description }),
      h('div.grid-2', priceField, field({ label: 'Duração', control: duration })),
      field({ label: 'Intervalo depois do atendimento', hint: 'Tempo para limpar e organizar antes da próxima cliente.', control: buffer }),
      h('label.switch', h('span', h('div.strong', 'Disponível para agendamento'), h('div.small.muted', 'Desativado, some do link mas continua aqui.')), active, h('span.track')),
      problem, save, remove),
  });
}

function services(ctx, main) {
  const list = ctx.services;
  const move = async (i, dir) => {
    const a = list[i];
    const b = list[i + dir];
    if (!a || !b) return;
    try {
      await ctx.store.saveService({ ...a, order: i + dir + 1 });
      await ctx.store.saveService({ ...b, order: i + 1 });
      await ctx.refreshBusiness();
      ctx.reload();
    } catch (err) { ctx.fail(err); }
  };
  mount(main, backLink(),
    h('div.sec-head', h('h1', { tabindex: '-1' }, 'Serviços'), h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => serviceSheet(ctx) }, icon('plus'), 'Novo')),
    list.length ? h('div.plist', list.map((s, i) => h('div.prow',
      h('div.stack-sm', { style: { gap: '2px' } },
        h('button.btn.btn-quiet.btn-icon.btn-sm', { type: 'button', disabled: i === 0, 'aria-label': `Subir ${s.name}`, onclick: () => move(i, -1), style: { minHeight: '1.9rem', width: '2.2rem' } }, h('span', { style: { transform: 'rotate(180deg)', display: 'block' } }, icon('down'))),
        h('button.btn.btn-quiet.btn-icon.btn-sm', { type: 'button', disabled: i === list.length - 1, 'aria-label': `Descer ${s.name}`, onclick: () => move(i, 1), style: { minHeight: '1.9rem', width: '2.2rem' } }, icon('down'))),
      h('button.grow', { type: 'button', onclick: () => serviceSheet(ctx, s), style: { border: 0, background: 'none', textAlign: 'left', padding: 0, minHeight: '3rem' }, 'aria-label': `Editar ${s.name}` },
        h('div.prow-title', s.name, s.active ? null : h('span.chip', { style: { marginLeft: '0.5rem' } }, 'Inativo')),
        h('div.prow-sub', `${fmtDuration(s.duration)}${s.buffer ? ` + ${s.buffer} min de intervalo` : ''}`)),
      h('span.prow-end.price', fmtMoney(s.price)))))
      : h('div.empty.card', icon('tag'), h('strong', 'Nenhum serviço'), h('span', 'Cadastre o primeiro para o link começar a funcionar.')),
    h('p.small.muted', 'Mudar preço ou duração vale só para as próximas reservas. As já marcadas continuam como estavam.'));
}

// ------------------------------------------------------------------ horários

function periodsEditor(initial) {
  let periods = initial.map((p) => ({ ...p }));
  const host = h('div.periods');
  const draw = () => mount(host, periods.map((p, i) => {
    const s = h('input.input', { type: 'time', step: '300', value: fmtTime(p.s), 'aria-label': i ? 'Volta às' : 'Abre às', onchange: (e) => { p.s = parseTime(e.target.value); } });
    const e = h('input.input', { type: 'time', step: '300', value: fmtTime(p.e === 1440 ? 1439 : p.e), 'aria-label': i === periods.length - 1 ? 'Fecha às' : 'Pausa às', onchange: (ev) => { p.e = parseTime(ev.target.value); } });
    return h('div.period', s, h('span.muted', 'às'), e,
      periods.length > 1 ? h('button.btn.btn-quiet.btn-icon', { type: 'button', 'aria-label': 'Remover este período', onclick: () => { periods.splice(i, 1); draw(); } }, icon('trash')) : h('span'));
  }),
  periods.length < 3 ? h('button.btn.btn-quiet.btn-sm', { type: 'button', style: { justifySelf: 'start' }, onclick: () => { const last = periods[periods.length - 1]; const start = Math.min((last?.e ?? 720) + 60, 1380); periods.push({ s: start, e: Math.min(start + 240, 1440) }); draw(); } }, icon('plus'), 'Adicionar pausa (novo período)') : null);
  draw();
  host.value = () => periods.map((p) => ({ s: p.s, e: p.e }));
  host.valid = () => periods.every((p) => p.s != null && p.e != null && p.s < p.e);
  return host;
}

function hours(ctx, main) {
  const editors = {};
  const toggles = {};
  const rows = [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const day = ctx.settings.week[wd];
    const body = h('div');
    const toggle = h('input', { type: 'checkbox', checked: day.open });
    editors[wd] = periodsEditor(day.open ? day.periods : [{ s: 540, e: 720 }, { s: 780, e: 1080 }]);
    toggles[wd] = toggle;
    const sync = () => mount(body, toggle.checked ? editors[wd] : h('p.small.muted', 'Fechado.'));
    toggle.addEventListener('change', sync);
    sync();
    return h('div.dayrow', h('label.switch', h('span.strong', cap(WEEKDAYS[wd])), toggle, h('span.track')), body);
  });
  const save = h('button.btn.btn-primary.btn-block', { type: 'button', onclick: async () => {
    const week = {};
    for (const wd of [0, 1, 2, 3, 4, 5, 6]) {
      if (toggles[wd].checked && !editors[wd].valid()) return toast(`Confira os horários de ${WEEKDAYS[wd]}: o início precisa ser antes do fim.`, { danger: true });
      week[wd] = { open: toggles[wd].checked, periods: toggles[wd].checked ? editors[wd].value() : [] };
    }
    await saveSettings(ctx, { week }, { resync: true, button: save, done: 'Horários salvos e agenda atualizada.' });
    return ctx.reload();
  } }, 'Salvar horários');
  mount(main, backLink(), h('h1', { tabindex: '-1' }, 'Horários de atendimento'),
    h('p.muted', 'Para o almoço ou outra pausa fixa, adicione um segundo período no dia.'),
    h('div.plist', rows), save,
    h('p.small.muted', 'Reservas já marcadas fora do novo horário não são canceladas: confira a agenda depois de salvar.'));
}

// ------------------------------------------------------------------ folgas, datas especiais e bloqueios

async function dates(ctx, main, alive) {
  mount(main, backLink(), h('h1', { tabindex: '-1' }, 'Folgas e datas especiais'), h('div.skeleton', { style: { height: '10rem' } }));
  const blocks = await ctx.store.listBlocks();
  if (!alive()) return;
  const today = ctx.today();
  const exceptions = Object.entries(ctx.settings.exceptions).map(([d, ex]) => [Number(d), ex]).filter(([d]) => d >= today).sort((a, b) => a[0] - b[0]);
  const put = async (day, ex, button) => {
    const next = { ...ctx.settings.exceptions };
    if (ex) next[day] = ex; else delete next[day];
    if (await saveSettings(ctx, { exceptions: next }, { resync: true, button, done: ex ? 'Data salva e agenda atualizada.' : 'Data removida.' })) ctx.reload();
  };

  function addSheet() {
    const date = h('input.input', { type: 'date', min: dayToIso(today), value: dayToIso(today), required: true });
    const special = h('input', { type: 'checkbox' });
    const editor = periodsEditor([{ s: 540, e: 720 }]);
    const body = h('div');
    const sync = () => mount(body, special.checked ? editor : h('p.small.muted', 'O dia inteiro fica fechado.'));
    special.addEventListener('change', sync);
    sync();
    const save = h('button.btn.btn-primary.btn-block', { type: 'submit' }, 'Salvar');
    const sheet = openSheet({ title: 'Folga ou data especial', body: h('form.stack', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const day = isoToDay(date.value);
      if (!day) return toast('Escolha a data.', { danger: true });
      if (special.checked && !editor.valid()) return toast('Confira os horários: o início precisa ser antes do fim.', { danger: true });
      await put(day, special.checked ? { periods: editor.value() } : { closed: true }, save);
      return sheet.close();
    } }, field({ label: 'Data', control: date }), h('label.switch', h('span', 'Atender em horário diferente neste dia'), special, h('span.track')), body, save) });
  }

  mount(main, backLink(),
    h('h1', { tabindex: '-1' }, 'Folgas e datas especiais'),
    h('section',
      h('div.sec-head', h('h2', 'Datas'), h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: addSheet }, icon('plus'), 'Adicionar')),
      exceptions.length ? h('div.plist', exceptions.map(([day, ex]) => h('div.prow',
        h('span.grow', h('div.prow-title', cap(fmtDayLong(day))), h('div.prow-sub', ex.closed ? 'Fechado' : `Atende ${ex.periods.map((p) => `das ${fmtTime(p.s)} às ${fmtTime(p.e)}`).join(' e ')}`)),
        h('button.btn.btn-quiet.btn-icon', { type: 'button', 'aria-label': `Remover ${fmtDayLong(day)}`, onclick: (e) => put(day, null, e.currentTarget) }, icon('trash')))))
        : h('div.card.small.muted', 'Nenhuma folga ou data especial marcada. Use para feriados, férias ou um sábado com horário diferente.')),
    h('section',
      h('div.sec-head', h('h2', 'Bloqueios de horário'), h('button.btn.btn-sm', { type: 'button', onclick: () => blockSheet(ctx, { day: today, onDone: ctx.reload }) }, icon('ban'), 'Bloquear')),
      blocks.filter((b) => b.day >= today).length ? h('div.plist', blocks.filter((b) => b.day >= today).map((b) => {
        const row = blockRow(ctx, b, { onDone: ctx.reload });
        row.querySelector('.appt-sub').textContent = `${cap(fmtDayLong(b.day))}${b.note ? ` · ${b.note}` : ''}`;
        return row;
      })) : h('div.card.small.muted', 'Nenhum bloqueio futuro. Use para uma consulta, um compromisso ou uma saída rápida.')));
}

// ------------------------------------------------------------------ regras

function rules(ctx, main) {
  const r = ctx.settings.rules;
  const hoursOpt = (list, value, zero) => select((list.includes(value) ? list : [...list, value].sort((a, b) => a - b)).map((m) => [m, m === 0 ? zero : m % 1440 === 0 ? `${m / 1440} ${m === 1440 ? 'dia' : 'dias'}` : m % 60 === 0 ? `${m / 60} ${m === 60 ? 'hora' : 'horas'}` : `${m} minutos`]), value);
  let mode = r.mode;
  const advance = hoursOpt([0, 30, 60, 120, 180, 360, 720, 1440, 2880], r.minAdvanceMin, 'Sem antecedência mínima');
  const maxDays = h('input.input', { type: 'number', inputmode: 'numeric', min: '1', max: '365', value: String(r.maxDays) });
  const step = select([10, 15, 20, 30, 60].map((m) => [m, `De ${m} em ${m} minutos`]), r.slotStepMin);
  const cancelLimit = hoursOpt([0, 60, 120, 360, 720, 1440, 2880], r.cancelLimitMin, 'Até o horário do atendimento');
  const approval = hoursOpt([60, 120, 360, 720, 1440, 2880], r.approvalMin, '');
  const approvalField = field({ label: 'Prazo para você responder', hint: 'Sem resposta nesse prazo, a solicitação expira e o horário é liberado. O prazo nunca passa de 1 hora antes do atendimento.', control: approval });
  const modeBox = h('div.segmented', { role: 'group', 'aria-label': 'Como confirmar' });
  const modeHint = h('p.small.muted');
  const drawMode = () => {
    mount(modeBox,
      h('button', { type: 'button', 'aria-pressed': String(mode === 'auto'), onclick: () => { mode = 'auto'; drawMode(); } }, 'Automática'),
      h('button', { type: 'button', 'aria-pressed': String(mode === 'approval'), onclick: () => { mode = 'approval'; drawMode(); } }, 'Com aprovação'));
    modeHint.textContent = mode === 'auto'
      ? 'A cliente escolhe um horário livre e ele já fica confirmado.'
      : 'A cliente envia uma solicitação. O horário fica reservado para ela até você aprovar ou recusar. Reservas muito próximas (menos de 1h30) não são aceitas neste modo.';
    approvalField.hidden = mode !== 'approval';
  };
  drawMode();
  const save = h('button.btn.btn-primary.btn-block', { type: 'submit' }, 'Salvar regras');
  mount(main, backLink(), h('h1', { tabindex: '-1' }, 'Regras de agendamento'),
    h('form.stack', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const days = Number(maxDays.value);
      if (!Number.isInteger(days) || days < 1 || days > 365) return toast('Dias à frente: use um número de 1 a 365.', { danger: true });
      const ok = await saveSettings(ctx, { rules: { ...r, mode, minAdvanceMin: Number(advance.value), maxDays: days, slotStepMin: Number(step.value), cancelLimitMin: Number(cancelLimit.value), approvalMin: Number(approval.value) } },
        { resync: days !== r.maxDays, button: save, done: 'Regras salvas. Valem para as próximas reservas.' });
      return ok ? ctx.reload() : undefined;
    } },
      h('div.stack-sm', h('span.label', 'Confirmação das reservas'), modeBox, modeHint),
      approvalField,
      field({ label: 'Antecedência mínima para reservar', control: advance }),
      field({ label: 'Agenda aberta por quantos dias', hint: 'Até quantos dias à frente a cliente pode marcar.', control: maxDays }),
      field({ label: 'Opções de horário', hint: 'De quanto em quanto tempo um horário de início é oferecido. Não é a duração do atendimento.', control: step }),
      field({ label: 'Cliente pode cancelar ou remarcar até', hint: 'Depois disso, só você altera pelo painel.', control: cancelLimit }),
      save));
}

// ------------------------------------------------------------------ dados do negócio

function resizeLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 192;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const g = canvas.getContext('2d');
      const side = Math.min(img.width, img.height);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, size, size);
      g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('imagem'));
    img.src = URL.createObjectURL(file);
  });
}

function business(ctx, main) {
  const b = ctx.settings.business;
  let accent = b.accent;
  let logo = b.logo;
  const name = h('input.input', { type: 'text', value: b.name, maxlength: '60', required: true });
  const tagline = h('input.input', { type: 'text', value: b.tagline, maxlength: '90' });
  const phone = h('input.input', { type: 'tel', inputmode: 'tel', value: b.phone ? fmtPhone(b.phone) : '', maxlength: '20', placeholder: '(92) 99999-9999' });
  const address = h('input.input', { type: 'text', value: b.address, maxlength: '160' });
  const privacy = h('textarea.textarea', { maxlength: '1200', rows: '5' }, ctx.settings.privacy.text);
  const zone = select(TIMEZONES.some(([z]) => z === ctx.settings.timezone) ? TIMEZONES : [...TIMEZONES, [ctx.settings.timezone, ctx.settings.timezone]], ctx.settings.timezone);
  const swatches = h('div.swatches', { role: 'group', 'aria-label': 'Cor principal' });
  const custom = h('input', { type: 'color', value: accent, 'aria-label': 'Escolher outra cor', style: { width: '2.75rem', height: '2.75rem', padding: 0, border: 0, background: 'none' }, oninput: (e) => { accent = e.target.value; drawSwatches(); } });
  const preview = h('div.small.muted');
  function drawSwatches() {
    mount(swatches, ACCENTS.map((c) => h('button.swatch', { type: 'button', style: { background: c }, 'aria-label': `Cor ${c}`, 'aria-pressed': String(c === accent), onclick: () => { accent = c; custom.value = c; drawSwatches(); } })), custom);
    const t = themeFrom(accent);
    mount(preview, h('span.btn.btn-sm', { style: { background: t.accent, color: t.onAccent, borderColor: t.accent, pointerEvents: 'none' } }, 'Exemplo de botão'),
      t.accent !== accent ? ' A cor foi escurecida um pouco para o texto continuar legível.' : '');
  }
  drawSwatches();
  const logoBox = h('div.row');
  function drawLogo() {
    mount(logoBox,
      logo ? h('img', { src: logo, alt: 'Logo atual', style: { width: '4rem', height: '4rem', borderRadius: '7px', objectFit: 'cover', border: '1px solid var(--line)' } }) : h('span.small.muted', 'Sem logo: o nome aparece em destaque.'),
      h('label.btn.btn-sm', 'Escolher imagem', h('input.sr-only', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try { logo = await resizeLogo(file); drawLogo(); } catch { toast('Não foi possível ler essa imagem.', { danger: true }); }
      } })),
      logo ? h('button.btn.btn-quiet.btn-sm', { type: 'button', onclick: () => { logo = ''; drawLogo(); } }, 'Remover') : null);
  }
  drawLogo();
  const nameField = field({ label: 'Nome do negócio', control: name });
  const save = h('button.btn.btn-primary.btn-block', { type: 'submit' }, 'Salvar');
  mount(main, backLink(), h('h1', { tabindex: '-1' }, 'Dados do negócio'),
    h('form.stack', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      nameField.setError(name.value.trim() ? '' : 'Digite o nome do negócio.');
      if (!name.value.trim()) return name.focus();
      const ok = await saveSettings(ctx, { business: { name: name.value, tagline: tagline.value, phone: phone.value, address: address.value, accent, logo }, privacy: { text: privacy.value }, timezone: zone.value },
        { resync: zone.value !== ctx.settings.timezone, button: save });
      return ok ? ctx.reload() : undefined;
    } },
      nameField,
      field({ label: 'Frase curta', hint: 'Opcional. Aparece abaixo do nome.', control: tagline }),
      field({ label: 'WhatsApp do negócio', hint: 'Com DDD. É para onde as clientes mandam mensagem.', control: phone }),
      field({ label: 'Endereço', control: address }),
      h('div.stack-sm', h('span.label', 'Cor principal'), swatches, preview),
      h('div.stack-sm', h('span.label', 'Logo'), logoBox),
      field({ label: 'Fuso horário', control: zone }),
      field({ label: 'Aviso de privacidade', hint: 'Mostrado às clientes no link de agendamento.', control: privacy }),
      save));
}

// ------------------------------------------------------------------ mensagens

function messages(ctx, main) {
  mount(main, backLink(), h('h1', { tabindex: '-1' }, 'Mensagens'),
    h('div.card.stack-sm', h('div.row.between', h('h2', 'WhatsApp manual'), h('span.chip.chip-ok', 'Ativo')),
      h('p.small', 'Os botões de WhatsApp abrem a conversa com o texto pronto: confirmação, lembrete, remarcação. A mensagem só é enviada quando você (ou a cliente) toca em enviar.')),
    h('div.card.stack-sm', h('div.row.between', h('h2', 'Envio automático'), h('span.chip', 'Desativado')),
      h('p.small', 'Confirmações e lembretes automáticos exigem a API oficial do WhatsApp e um servidor, que têm custo. Esta instalação não envia nenhuma mensagem sozinha.'),
      h('p.small.muted', 'O passo a passo para ativar no futuro está na documentação (docs/WHATSAPP.md).')));
}

// ------------------------------------------------------------------ exportar e importar

function data(ctx, main) {
  const report = h('div', { role: 'status' });
  const exportBtn = h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => busy(exportBtn, async () => {
    try {
      const file = await ctx.store.exportAll();
      downloadText(`agenda-${file.exportedAt.slice(0, 10)}.json`, JSON.stringify(file, null, 2), 'application/json');
      toast(`Arquivo gerado com ${file.bookings.length} ${file.bookings.length === 1 ? 'reserva' : 'reservas'}.`);
    } catch (err) { ctx.fail(err); }
  }) }, icon('download'), 'Exportar tudo');
  const replace = h('input', { type: 'checkbox' });
  const fileInput = h('input.sr-only', { type: 'file', accept: 'application/json,.json', onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    mount(report, h('div.notice', icon('clock'), h('span', 'Importando… não feche esta tela.')));
    try {
      const r = await ctx.store.importAll(JSON.parse(await file.text()), { replaceSettings: replace.checked });
      await ctx.refreshBusiness();
      mount(report, h('div.notice.notice-ok', icon('check'), h('div.stack-sm',
        h('strong', 'Importação concluída'),
        h('span', `${r.active} reservas ativas e ${r.history} do histórico recuperadas. ${r.services} serviços e ${r.blocks} bloqueios gravados.${r.settings ? ' Configuração substituída.' : ''}`),
        r.skipped ? h('span', `${r.skipped} já existiam ou eram inválidas e foram puladas.`) : null,
        r.conflicts.length ? h('span', `Não entraram por conflito de horário: ${r.conflicts.map((c) => `${c.name} (${fmtDayLong(c.day)} às ${fmtTime(c.start * 5)})`).join('; ')}.`) : null)));
    } catch (err) {
      mount(report, h('div.notice.notice-danger', { role: 'alert' }, icon('alert'), h('span', err instanceof SyntaxError ? 'Este arquivo não pôde ser lido.' : errorText(err))));
    }
  } });
  mount(main, backLink(), h('h1', { tabindex: '-1' }, 'Exportar e importar dados'),
    h('div.notice.notice-warn', icon('info'), h('span', h('strong', 'Isto é uma cópia manual, não um backup automático. '), 'Exporte de tempos em tempos e guarde o arquivo em local seguro: ele contém nomes e telefones das clientes.')),
    h('section', h('h2', 'Exportar'), h('p.small.muted', 'Gera um arquivo com configuração, serviços, bloqueios e todas as reservas.'), exportBtn),
    h('section', h('h2', 'Importar'),
      h('p.small.muted', 'Recupera um arquivo exportado por este sistema. Nada é apagado: reservas que já existem são mantidas e as que conflitarem com a agenda atual são listadas.'),
      h('label.switch', h('span', 'Substituir também a configuração (nome, horários e regras)'), replace, h('span.track')),
      h('label.btn.btn-block', icon('upload'), 'Escolher arquivo para importar', fileInput),
      report));
}

export async function renderAjustes(ctx, main, rest, alive) {
  const pages = { servicos: services, horarios: hours, regras: rules, negocio: business, mensagens: messages, dados: data };
  if (rest[0] === 'datas') return dates(ctx, main, alive);
  return (pages[rest[0]] || home)(ctx, main);
}
