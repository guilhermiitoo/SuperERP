// Escolha de dia e horário. Usado no agendamento público, na remarcação e na reserva manual.
import { h, mount } from './dom.js';
import { icon } from './icons.js';
import { leaf } from './leaf.js';
import { addDays, fmtDayLong, fmtDayShort, instantOf } from '../core/time.js';
import { lastPublicDay, listSlots, todayOf } from '../core/schedule.js';

const FIRST_CHUNK = 14;

/**
 * @param o {{store, settings, service, actor: 'public'|'owner', selected?: {day, start}, exclude?: {day, start, n},
 *            onPick: ({day, start, label}) => void, maxDays?: number}}
 * `exclude`: átomos da própria reserva, tratados como livres ao remarcar.
 * @returns {HTMLElement & {refresh: () => Promise<void>}}
 */
export function timePicker(o) {
  const root = h('div.stack');
  const offset = o.settings.utcOffsetMin;
  const st = { days: {}, loadedTo: 0, day: o.selected?.day || null, loading: true, error: null, loadedAt: 0 };

  const today = () => todayOf(o.store.now(), offset);
  const horizon = () => (o.actor === 'owner' ? addDays(today(), o.maxDays ?? 60) : lastPublicDay(o.store.now(), o.settings));
  const ctx = () => ({ nowMs: o.store.now(), settings: o.settings, actor: o.actor });

  function dayDoc(day) {
    const doc = st.days[day];
    if (!doc || !o.exclude || o.exclude.day !== day) return doc;
    const busy = { ...doc.busy };
    for (let k = o.exclude.start; k < o.exclude.start + o.exclude.n; k++) delete busy[k];
    return { ...doc, busy };
  }

  function slotsOf(day) {
    const slots = listSlots(dayDoc(day), o.service, ctx());
    return o.exclude && o.exclude.day === day ? slots.filter((s) => s.start !== o.exclude.start) : slots;
  }

  async function load(toDay) {
    const from = today();
    const to = toDay > horizon() ? horizon() : toDay;
    st.loading = true;
    st.error = null;
    draw();
    try {
      st.days = await o.store.loadDays(from, to);
      st.loadedTo = to;
      st.loadedAt = Date.now();
      if (!st.day || st.day < from || !slotsOf(st.day).length) st.day = firstOpen(from) ?? st.day ?? from;
    } catch (e) {
      st.error = e;
    }
    st.loading = false;
    draw();
  }

  function firstOpen(from) {
    for (let d = from; d <= st.loadedTo; d = addDays(d, 1)) if (slotsOf(d).length) return d;
    return null;
  }

  function leafFor(day) {
    const doc = st.days[day];
    const closed = !doc || doc.shut;
    const free = slotsOf(day).length;
    const foot = closed ? 'fechado' : free ? null : 'lotado';
    return leaf(day, {
      on: st.day === day,
      disabled: !free,
      foot,
      top: day === today() ? 'hoje' : null,
      onclick: () => { st.day = day; draw(); root.querySelector('.slots-wrap')?.focus?.(); },
    });
  }

  function group(title, slots) {
    if (!slots.length) return null;
    return h('div', h('div.slot-group', title), h('div.slots', slots.map((s) => h('button.slot', {
      type: 'button',
      'aria-pressed': o.selected && o.selected.day === st.day && o.selected.start === s.start ? 'true' : 'false',
      'aria-label': `${s.label}, ${fmtDayLong(st.day)}`,
      onclick: () => o.onPick({ day: st.day, start: s.start, label: s.label }),
    }, s.label))));
  }

  function draw() {
    if (st.error) {
      mount(root, h('div.notice.notice-danger', { role: 'alert' }, icon('alert'),
        h('div.stack-sm', h('span', 'Não foi possível carregar os horários. Verifique a conexão.'),
          h('button.btn.btn-sm', { type: 'button', onclick: () => load(st.loadedTo || addDays(today(), FIRST_CHUNK - 1)) }, 'Tentar de novo'))));
      return;
    }
    if (st.loading && !st.loadedTo) {
      mount(root, h('div', { 'aria-busy': 'true', 'aria-label': 'Carregando horários' },
        h('div.leaves', Array.from({ length: 6 }, () => h('div.skeleton', { style: { width: '4.1rem', height: '5.4rem', flex: 'none' } }))),
        h('div.slots', { style: { marginTop: '1rem' } }, Array.from({ length: 6 }, () => h('div.skeleton', { style: { height: '3.25rem' } })))));
      return;
    }
    const leaves = [];
    for (let d = today(); d <= st.loadedTo; d = addDays(d, 1)) leaves.push(leafFor(d));
    if (st.loadedTo < horizon()) {
      leaves.push(h('button.leaf', { type: 'button', onclick: () => load(horizon()), 'aria-label': 'Mostrar mais datas' },
        h('span.leaf-top', 'mais'), h('span.leaf-day', { 'aria-hidden': 'true' }, '+'), h('span.leaf-foot', 'datas')));
    }

    const slots = st.day ? slotsOf(st.day) : [];
    const doc = st.days[st.day];
    let body;
    if (slots.length) {
      const nowMs = o.store.now();
      const past = slots.filter((s) => instantOf(st.day, s.minutes, offset) < nowMs);
      const ahead = slots.filter((s) => !past.includes(s));
      body = h('div.stack.flip-in', { key: st.day },
        group('Manhã', ahead.filter((s) => s.minutes < 720)),
        group('Tarde', ahead.filter((s) => s.minutes >= 720 && s.minutes < 1080)),
        group('Noite', ahead.filter((s) => s.minutes >= 1080)),
        past.length ? h('div.slots-past', group('Já passou (para registrar um atendimento)', past)) : null);
    } else {
      const next = firstOpenAfter(st.day);
      const closed = !doc || doc.shut;
      body = h('div.empty.flip-in',
        icon(closed ? 'ban' : 'clock'),
        h('strong', closed ? 'Fechado neste dia' : 'Sem horários livres neste dia'),
        next
          ? h('button.btn.btn-primary', { type: 'button', onclick: () => { st.day = next; draw(); scrollToLeaf(next); } }, `Ver ${fmtDayShort(next)}`)
          : st.loadedTo < horizon()
            ? h('button.btn', { type: 'button', onclick: () => load(horizon()) }, 'Procurar em mais datas')
            : h('span', o.actor === 'owner' ? 'Não há horário livre para este serviço no período.' : 'Não há horários livres nas próximas semanas. Fale com o estabelecimento.'),
        next ? h('span.small', 'É o próximo dia com horário livre.') : null);
    }

    mount(root,
      h('div.leaves', { role: 'group', 'aria-label': 'Dias' }, leaves),
      h('div.slots-wrap.stack', { tabindex: '-1', 'aria-live': 'polite' },
        h('h3.day-title', st.day ? fmtDayLong(st.day) : ''),
        body),
    );
    scrollToLeaf(st.day, false);
  }

  function firstOpenAfter(day) {
    for (let d = addDays(day, 1); d <= st.loadedTo; d = addDays(d, 1)) if (slotsOf(d).length) return d;
    return null;
  }

  function scrollToLeaf(day, smooth = true) {
    const el = root.querySelector(`[data-day="${day}"]`);
    const strip = root.querySelector('.leaves');
    if (!el || !strip) return;
    const left = el.offsetLeft - strip.offsetLeft - 16;
    if (left < strip.scrollLeft || left > strip.scrollLeft + strip.clientWidth - el.offsetWidth - 32) {
      strip.scrollTo({ left, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    }
  }

  root.refresh = () => load(st.loadedTo || addDays(today(), FIRST_CHUNK - 1));
  root.loadedAt = () => st.loadedAt;
  load(st.day && st.day > addDays(today(), FIRST_CHUNK - 1) ? horizon() : addDays(today(), FIRST_CHUNK - 1));
  return root;
}
