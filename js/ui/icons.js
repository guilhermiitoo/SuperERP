// Ícones próprios: traço único de 1,75, grade de 24, pontas arredondadas. Sem emoji na interface.

const NS = 'http://www.w3.org/2000/svg';

// p: caminho; c: círculo [cx, cy, r]; r: retângulo [x, y, w, h, rx]; d: ponto cheio [cx, cy, r]
const ICONS = {
  calendar: { r: [[3.5, 5, 17, 15, 2.2]], p: ['M8 3v4', 'M16 3v4', 'M3.5 10h17'] },
  today: { r: [[3.5, 5, 17, 15, 2.2]], p: ['M8 3v4', 'M16 3v4', 'M3.5 10h17'], d: [[12, 15, 1.7]] },
  clock: { c: [[12, 12, 8.5]], p: ['M12 7.5V12l3 2'] },
  check: { p: ['M5 12.5l4.5 4.5L19 7.5'] },
  x: { p: ['M6 6l12 12', 'M18 6L6 18'] },
  left: { p: ['M14.5 6l-6 6 6 6'] },
  right: { p: ['M9.5 6l6 6-6 6'] },
  down: { p: ['M6 9.5l6 6 6-6'] },
  plus: { p: ['M12 5v14', 'M5 12h14'] },
  user: { c: [[12, 8.5, 3.5]], p: ['M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5'] },
  users: { c: [[9, 8.5, 3.2]], p: ['M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5', 'M16 5.6a3.2 3.2 0 010 5.8', 'M17.5 14.8c2 .6 3.2 2.2 3.6 4.7'] },
  sliders: { p: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9'], c: [[15, 7, 2], [9, 17, 2]] },
  chat: { p: ['M20 11.5a8 8 0 01-11.8 7L4 20l1.5-4.2A8 8 0 1120 11.5z'] },
  phone: { p: ['M6.5 4h3l1.5 4-2 1.5a12 12 0 005.5 5.5l1.5-2 4 1.5v3a2 2 0 01-2.2 2A16 16 0 014.5 6.2 2 2 0 016.5 4z'] },
  pin: { p: ['M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0113 0C18.5 15.4 12 21 12 21z'], c: [[12, 10.5, 2.2]] },
  ban: { c: [[12, 12, 8.5]], p: ['M6 6l12 12'] },
  pause: { p: ['M9 6v12', 'M15 6v12'] },
  play: { p: ['M8 5.5v13l11-6.5z'] },
  download: { p: ['M12 4v11', 'M7.5 11l4.5 4.5 4.5-4.5', 'M5 19.5h14'] },
  upload: { p: ['M12 16V5', 'M7.5 9L12 4.5 16.5 9', 'M5 19.5h14'] },
  search: { c: [[11, 11, 6.5]], p: ['M16 16l4.5 4.5'] },
  edit: { p: ['M5 19h3.5L19 8.5 15.5 5 5 15.5z', 'M13.5 7l3.5 3.5'] },
  trash: { p: ['M5 7h14', 'M9.5 7V4.5h5V7', 'M7 7l1 12.5h8L17 7'] },
  alert: { p: ['M12 4.5l8.5 15h-17z', 'M12 10v4.5'], d: [[12, 17, 0.7]] },
  info: { c: [[12, 12, 8.5]], p: ['M12 11v5.5'], d: [[12, 7.8, 0.7]] },
  offline: { p: ['M3 9.5a14 14 0 0118 0', 'M6.5 13a9 9 0 0111 0', 'M10 16.5a4 4 0 014 0', 'M4 4l16 16'], d: [[12, 19.5, 0.8]] },
  link: { p: ['M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1', 'M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'] },
  copy: { r: [[8.5, 8.5, 11, 11, 2]], p: ['M5.5 15.5V6.5A1.5 1.5 0 017 5h9'] },
  logout: { p: ['M14 5H6.5v14H14', 'M10.5 12h10', 'M17 8.5l3.5 3.5-3.5 3.5'] },
  refresh: { p: ['M19.5 12a7.5 7.5 0 11-2.4-5.5', 'M19.5 4.5v4h-4'] },
  tag: { p: ['M4 12.5V5h7.5l8.5 8.5-7.5 7.5z'], d: [[8.5, 9, 1.1]] },
  store: { p: ['M4 9.5l1.5-5h13l1.5 5', 'M5 9.5V20h14V9.5', 'M9.5 20v-5.5h5V20'] },
  shield: { p: ['M12 3.5l7 2.5v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z'] },
  hourglass: { p: ['M7 4h10', 'M7 20h10', 'M8 4c0 4 4 5 4 8s-4 4-4 8', 'M16 4c0 4-4 5-4 8s4 4 4 8'] },
  share: { c: [[6.5, 12, 2.3], [17.5, 6, 2.3], [17.5, 18, 2.3]], p: ['M8.5 11l7-4', 'M8.5 13l7 4'] },
  undo: { p: ['M9 8.5H5V4.5', 'M5 8.5c2-3 5-4 8-3.4a7 7 0 11-6.8 9.4'] },
  swap: { p: ['M4 8h14', 'M14.5 4.5L18 8l-3.5 3.5', 'M20 16H6', 'M9.5 12.5L6 16l3.5 3.5'] },
  key: { c: [[8, 15, 3.5]], p: ['M10.5 12.5L19 4', 'M15.5 7.5l3 3'] },
};

export function icon(name, { label, size } = {}) {
  const def = ICONS[name] || ICONS.info;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `ico${size === 'lg' ? ' ico-lg' : ''}`);
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  };
  for (const [x, y, width, height, rx] of def.r || []) add('rect', { x, y, width, height, rx });
  for (const [cx, cy, r] of def.c || []) add('circle', { cx, cy, r });
  for (const d of def.p || []) add('path', { d });
  for (const [cx, cy, r] of def.d || []) add('circle', { cx, cy, r, fill: 'currentColor', stroke: 'none' });
  return svg;
}
