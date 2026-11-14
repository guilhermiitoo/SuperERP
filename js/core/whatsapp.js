// WhatsApp manual: abre a conversa com o texto pronto. Quem envia é a pessoa, tocando em enviar.
// Nada aqui envia mensagem sozinho.

import { fmtDayLong, fmtTime, localOf } from './time.js';

/** Link wa.me para um telefone brasileiro (DDD + número, só dígitos). */
export function waLink(phoneDigits, text) {
  if (!phoneDigits) return null;
  return `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(text)}`;
}

const firstName = (name) => String(name).trim().split(/\s+/)[0];

/**
 * Texto pronto para cada situação.
 * customer_*: a cliente escreve para o estabelecimento. owner_*: o estabelecimento escreve para a cliente.
 * @param ctx {{business: {name: string}, offsetMin: number, link?: string}}
 */
export function messageFor(kind, booking, ctx) {
  const { day, minutes } = localOf(booking.startAt, ctx.offsetMin);
  const when = `${fmtDayLong(day)}, às ${fmtTime(minutes)}`;
  const service = booking.service.name;
  const me = booking.customer.name;
  const hi = `Olá, ${firstName(me)}!`;
  const place = ctx.business.name;
  const link = ctx.link ? `\n\nPara ver, remarcar ou cancelar: ${ctx.link}` : '';
  switch (kind) {
    case 'customer_confirmed':
      return `Olá! Sou ${me} e acabei de agendar ${service} para ${when}. Até lá!`;
    case 'customer_pending':
      return `Olá! Sou ${me} e enviei uma solicitação de ${service} para ${when}. Pode confirmar para mim?`;
    case 'customer_rescheduled':
      return `Olá! Sou ${me} e remarquei meu horário de ${service} para ${when}.`;
    case 'customer_cancelled':
      return `Olá! Sou ${me} e cancelei meu horário de ${service} de ${when}.`;
    case 'owner_confirmed':
      return `${hi} Seu horário no ${place} está confirmado: ${service}, ${when}.${link}`;
    case 'owner_reminder':
      return `${hi} Passando para lembrar do seu horário no ${place}: ${service}, ${when}.${link}`;
    case 'owner_rescheduled':
      return `${hi} Seu horário no ${place} foi remarcado: ${service}, ${when}.${link}`;
    case 'owner_declined':
      return `${hi} Infelizmente não vou conseguir atender em ${when}. Quer escolher outro horário?`;
    case 'owner_cancelled':
      return `${hi} Precisei cancelar seu horário de ${service} de ${when}. Vamos remarcar?`;
    default:
      return `${hi}`.replace('!', ',') + ' tudo bem?';
  }
}
