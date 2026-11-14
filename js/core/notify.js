// Avisos para a profissional quando uma cliente reserva, remarca ou cancela pelo link.
//
// Gratuito e sem servidor: usa o EmailJS (plano grátis: 200 e-mails/mês; ao passar do limite ele para
// de enviar, sem cobrar). O e-mail é disparado pelo navegador da cliente DEPOIS que a reserva já foi
// gravada no servidor — se falhar, a reserva continua valendo e aparece no painel normalmente.
// Configuração em public/config.js (`avisoEmail`) e passo a passo em docs/ENTREGA.md.
//
// O WhatsApp continua manual: os botões abrem a conversa com o texto pronto e a pessoa toca em enviar.

import { fmtDayLong, fmtMoney, fmtTime, localOf } from './time.js';
import { fmtPhone } from './validate.js';

export const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';

const SUBJECT = {
  booking_created: 'Novo agendamento',
  booking_pending: 'Pedido para aprovar',
  booking_rescheduled: 'Reserva remarcada',
  booking_cancelled: 'Reserva cancelada',
};

const STATUS = { confirmed: 'Confirmado', pending: 'Aguardando sua aprovação', cancelled: 'Cancelado' };

/**
 * @param o {{config: {serviceId: string, templateId: string, publicKey: string}|null,
 *            ctx: {business: {name: string}, offsetMin: number, panelUrl: string}, fetch?: Function}}
 * @returns {{enabled: boolean, notify: (event: string, booking: object) => Promise<{status: string}>}}
 */
export function createEmailNotifier({ config, ctx, fetch = globalThis.fetch }) {
  const enabled = !!(config?.serviceId && config?.templateId && config?.publicKey);
  return {
    enabled,
    async notify(event, b) {
      if (!enabled) return { status: 'disabled' };
      if (!SUBJECT[event]) return { status: 'ignored' };
      const { day, minutes } = localOf(b.startAt, ctx.offsetMin);
      const when = `${fmtDayLong(day)}, às ${fmtTime(minutes)}`;
      // Só o necessário para a profissional agir. O código secreto da reserva nunca vai no e-mail.
      const params = {
        assunto: `${SUBJECT[event]}: ${b.customer.name}, ${when}`,
        situacao: STATUS[b.status] || b.status,
        cliente: b.customer.name,
        telefone: fmtPhone(b.customer.phone),
        servico: `${b.service.name} · ${fmtMoney(b.service.price)}`,
        quando: when,
        negocio: ctx.business.name,
        painel: ctx.panelUrl,
        whatsapp: `https://wa.me/55${b.customer.phone}`,
      };
      try {
        const res = await fetch(EMAILJS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service_id: config.serviceId, template_id: config.templateId, user_id: config.publicKey, template_params: params }),
          keepalive: true, // conclui o envio mesmo se a cliente fechar a página logo em seguida
        });
        return { status: res.ok ? 'sent' : 'failed' };
      } catch {
        return { status: 'failed' };
      }
    },
  };
}

/** Sem configuração: não faz nada. Substituído em boot.js quando `avisoEmail` está preenchido. */
export let notifier = createEmailNotifier({ config: null, ctx: null });

export function setNotifier(next) {
  notifier = next;
}
