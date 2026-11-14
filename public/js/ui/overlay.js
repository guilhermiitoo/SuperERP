// Folha deslizante (diálogo nativo: foco preso, Esc fecha), confirmação e avisos rápidos.
import { h, append } from './dom.js';
import { icon } from './icons.js';

/**
 * @param o {{title: string, body: Node|Node[], foot?: Node|Node[], onClose?: Function}}
 * @returns {{el: HTMLDialogElement, close: Function, body: HTMLElement}}
 */
export function openSheet({ title, body, foot, onClose }) {
  const bodyEl = h('div.sheet-body');
  append(bodyEl, [body]);
  const dialog = h('dialog.sheet', { 'aria-label': title },
    h('div.sheet-head', h('h2', title), h('button.btn.btn-quiet.btn-icon', { type: 'button', 'aria-label': 'Fechar', onclick: () => dialog.close() }, icon('x'))),
    bodyEl,
    foot ? append(h('div.sheet-foot'), [foot]) : null,
  );
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.(); });
  document.body.append(dialog);
  dialog.showModal();
  return { el: dialog, body: bodyEl, close: () => dialog.open && dialog.close() };
}

/** Pergunta de confirmação. Resolve true só se a pessoa confirmar. */
export function confirmSheet({ title, text, confirmLabel = 'Confirmar', cancelLabel = 'Voltar', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const yes = h(`button.btn.${danger ? 'btn-danger' : 'btn-primary'}`, { type: 'button', onclick: () => { answer = true; sheet.close(); } }, confirmLabel);
    const no = h('button.btn', { type: 'button', onclick: () => sheet.close() }, cancelLabel);
    const sheet = openSheet({ title, body: h('p', text), foot: [no, yes], onClose: () => resolve(answer) });
  });
}

let region;
export function toast(message, { danger = false, ms = 4200 } = {}) {
  if (!region) { region = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.append(region); }
  const el = h(`div.toast${danger ? '.toast-danger' : ''}`, message);
  region.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Faixa "sem conexão" no topo; avisa quem estiver ouvindo quando a conexão muda. */
let connection = null;
export function watchConnection(host, onChange) {
  const bar = h('div.offline-bar', { role: 'status', hidden: navigator.onLine }, icon('offline'), 'Sem conexão. Os dados podem estar desatualizados e não é possível agendar agora.');
  host.prepend(bar);
  if (!connection) {
    const update = () => { connection.bar.hidden = navigator.onLine; connection.onChange?.(navigator.onLine); };
    addEventListener('online', update);
    addEventListener('offline', update);
  }
  connection = { bar, onChange };
  return bar;
}
