// Tema por instalação: a partir da cor principal escolhida, calcula as cores que dependem dela
// garantindo contraste WCAG AA.

export const DEFAULT_ACCENT = '#8b2f4b';
const PAPER = '#fbf7f7';
const INK = '#2a1f22';

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hexOf = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a, b, t) => hexOf(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));

/**
 * @returns {{accent: string, onAccent: string, accentText: string}}
 * accent: fundo de botões e faixas; onAccent: texto sobre ele; accentText: a cor usada como texto no papel.
 */
export function themeFrom(input) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(input || '') ? input.toLowerCase() : DEFAULT_ACCENT;
  const onAccent = contrast('#ffffff', accent) >= 4.5 ? '#ffffff' : INK;
  // se nem branco nem tinta dão contraste (tons médios), escurece o próprio fundo até o branco servir
  let fill = accent;
  for (let t = 0.1; contrast(onAccent, fill) < 4.5 && t <= 1; t += 0.1) fill = mix(accent, onAccent === '#ffffff' ? '#000000' : '#ffffff', t);
  let accentText = accent;
  for (let t = 0.1; contrast(accentText, PAPER) < 4.5 && t <= 1; t += 0.1) accentText = mix(accent, INK, t);
  return { accent: fill, onAccent, accentText };
}

export function applyTheme(root, accentHex) {
  const t = themeFrom(accentHex);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--on-accent', t.onAccent);
  root.style.setProperty('--accent-text', t.accentText);
  return t;
}
