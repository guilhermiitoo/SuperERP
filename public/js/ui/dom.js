// Construção de DOM sem innerHTML: todo texto vindo de pessoas entra como texto, nunca como marcação.

const BOOL = new Set(['disabled', 'hidden', 'checked', 'required', 'readonly', 'selected', 'open', 'autofocus', 'multiple', 'novalidate']);

/**
 * h('button.btn.btn-primary', { type: 'button', onclick }, 'Continuar')
 * Filhos: texto, nós, listas; null/false/undefined são ignorados.
 */
export function h(spec, props, ...children) {
  const [tagAndId, ...classes] = spec.split('.');
  const [tag, id] = tagAndId.split('#');
  const el = document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (props && (props instanceof Node || typeof props !== 'object' || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = `${el.className} ${v}`.trim();
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (BOOL.has(k)) el[k === 'readonly' ? 'readOnly' : k === 'novalidate' ? 'noValidate' : k] = true;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Troca todo o conteúdo de um elemento. */
export function mount(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export const $ = (sel, root = document) => root.querySelector(sel);

let uid = 0;
export const newId = (prefix = 'f') => `${prefix}${++uid}`;

/** Campo com rótulo, dica e mensagem de erro ligados ao controle. */
export function field({ label, hint, error, control }) {
  const id = control.id || (control.id = newId());
  const describedBy = [];
  let hintEl = null;
  let errorEl = null;
  if (hint) { hintEl = h('span.hint', { id: `${id}-h` }, hint); describedBy.push(hintEl.id); }
  errorEl = h('span.error', { id: `${id}-e`, role: 'alert', hidden: !error }, error || '');
  describedBy.push(errorEl.id);
  control.setAttribute('aria-describedby', describedBy.join(' '));
  if (error) control.setAttribute('aria-invalid', 'true');
  const wrap = h('div.field', h('label', { for: id }, label), control, hintEl, errorEl);
  wrap.setError = (msg) => {
    errorEl.textContent = msg || '';
    errorEl.hidden = !msg;
    if (msg) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  };
  return wrap;
}

/** Executa uma ação assíncrona a partir de um botão: bloqueia cliques repetidos e mostra carregando. */
export async function busy(button, fn) {
  if (!button || button.getAttribute('aria-busy') === 'true') return undefined;
  button.setAttribute('aria-busy', 'true');
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.removeAttribute('aria-busy');
    button.disabled = false;
  }
}

export function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
