// A "folha" de calendário: dia da semana na faixa, número grande, mês no rodapé.
import { h } from './dom.js';
import { MONTHS_SHORT, WEEKDAYS_SHORT, fmtDayLong, partsOf, weekdayOf } from '../core/time.js';

/**
 * @param o {{on?: boolean, large?: boolean, disabled?: boolean, foot?: string, top?: string, onclick?: Function, label?: string}}
 */
export function leaf(day, o = {}) {
  const { m, d } = partsOf(day);
  const cls = `leaf${o.large ? '.leaf-lg' : ''}${o.on && !o.onclick ? '.is-on' : ''}`;
  const kids = [
    h('span.leaf-top', o.top || WEEKDAYS_SHORT[weekdayOf(day)]),
    h('span.leaf-day', String(d)),
    h('span.leaf-foot', o.foot || MONTHS_SHORT[m - 1]),
  ];
  if (!o.onclick) return h(`div.${cls}`, { role: 'img', 'aria-label': o.label || fmtDayLong(day) }, kids);
  return h(`button.${cls}`, {
    type: 'button',
    'aria-pressed': o.on ? 'true' : 'false',
    'aria-label': `${fmtDayLong(day)}${o.disabled ? `, ${o.foot || 'indisponível'}` : ''}`,
    dataset: o.disabled ? { day, off: '1' } : { day },
    onclick: o.onclick,
  }, kids);
}
