// Interface para automação futura de mensagens (WhatsApp oficial). DESATIVADA por padrão.
//
// Nesta versão não existe servidor para enviar mensagens: o aplicativo só abre o WhatsApp com o
// texto pronto. Este objeto é o ponto único onde uma automação pode ser ligada depois, sem tocar
// nas telas. Veja docs/WHATSAPP.md.
//
// Contrato: notify(evento, reserva) devolve {status}. Enquanto desativado devolve 'disabled' e as
// telas nunca dizem que uma mensagem foi enviada. Uma implementação real deve chamar um endpoint
// do próprio servidor (as credenciais da API ficam lá, nunca aqui) e devolver 'queued' ou 'failed'.

export const NOTIFY_EVENTS = Object.freeze([
  'booking_created', 'booking_pending', 'booking_approved', 'booking_declined',
  'booking_rescheduled', 'booking_cancelled',
]);

export const notifier = {
  enabled: false,
  /** @returns {Promise<{status: 'disabled'|'queued'|'failed'}>} */
  async notify(_event, _booking) {
    return { status: 'disabled' };
  },
};
