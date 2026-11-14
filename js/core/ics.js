// Arquivo de calendário (.ics, RFC 5545) para a cliente adicionar o atendimento à agenda do celular.

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (text) => String(text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Dobra linhas em até 75 octetos, como a norma exige. */
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  for (const ch of line) {
    const limit = out.length ? 74 : 75; // linhas de continuação começam com um espaço
    if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * @param ctx {{business: {name: string, address?: string}, link?: string, nowMs: number}}
 */
export function buildIcs(booking, ctx) {
  const end = booking.startAt + booking.service.duration * 60000;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Agenda Base//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.bid}@agenda-base`,
    `DTSTAMP:${stamp(ctx.nowMs)}`,
    `DTSTART:${stamp(booking.startAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${booking.service.name} — ${ctx.business.name}`)}`,
    ctx.business.address ? `LOCATION:${esc(ctx.business.address)}` : null,
    ctx.link ? `DESCRIPTION:${esc(`Para ver, remarcar ou cancelar: ${ctx.link}`)}` : null,
    `STATUS:${booking.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}
