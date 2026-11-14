// Escolha de hora sempre em 24 h (o <input type="time"> segue o idioma do aparelho e pode mostrar AM/PM).
import { h } from './dom.js';
import { fmtTime } from '../core/time.js';

/**
 * @param o {{value: number, step?: number, end?: boolean, label?: string, onchange?: Function}}
 * `end`: oferece 24:00 (fim do dia). O valor lido é o texto "HH:MM".
 */
export function timeSelect({ value, step = 15, end = false, label, onchange } = {}) {
  const options = [];
  for (let m = 0; m < 1440; m += step) options.push(m);
  if (end) options.push(1440);
  if (value != null && !options.includes(value)) options.push(value);
  options.sort((a, b) => a - b);
  return h('select.select.time-select', { 'aria-label': label || null, onchange },
    options.map((m) => h('option', { value: fmtTime(m), selected: m === value }, fmtTime(m))));
}
