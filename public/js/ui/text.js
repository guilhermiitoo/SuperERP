// Textos compartilhados: nomes de estado e mensagens de erro em linguagem de gente.

export const STATUS_LABEL = {
  pending: 'Aguardando aprovação', confirmed: 'Confirmado', done: 'Concluído', cancelled: 'Cancelado',
  declined: 'Recusado', expired: 'Expirado', noshow: 'Não compareceu',
};

/** Versão curta, para listas. */
export const STATUS_SHORT = { ...STATUS_LABEL, pending: 'Pendente', noshow: 'Não veio' };

export const STATUS_CHIP = {
  pending: 'chip-warn', confirmed: 'chip-ok', done: 'chip-done', cancelled: 'chip-danger',
  declined: 'chip-danger', expired: 'chip-done', noshow: 'chip-danger',
};

const ERRORS = {
  slot_taken: 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro, por favor.',
  too_soon: 'Esse horário está muito próximo e não pode mais ser reservado. Escolha um horário mais à frente.',
  too_far: 'Essa data ainda não está aberta para agendamento.',
  paused: 'Os agendamentos pelo link estão pausados no momento.',
  service_unavailable: 'Esse serviço não está mais disponível. Escolha outro, por favor.',
  invalid_name: 'Digite seu nome para a gente saber quem vem.',
  invalid_phone: 'Confira o telefone: precisa ter DDD e o número completo.',
  too_late: 'O prazo para fazer essa mudança pelo link já passou. Fale com o estabelecimento.',
  expired: 'Essa solicitação já expirou.',
  not_allowed: 'Essa ação não está disponível para esta reserva.',
  not_found: 'Não encontramos essa reserva.',
  not_ready: 'Este link ainda não está pronto para receber agendamentos.',
  offline: 'Sem conexão com o servidor. Nada foi alterado. Verifique a internet e tente de novo.',
  auth_invalid: 'E-mail ou senha incorretos.',
  auth_throttled: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  demo_only: 'Na demonstração não há envio de e-mail.',
  invalid_period: 'Confira os horários: o início precisa ser antes do fim.',
  invalid_rule: 'Um dos valores está fora do limite permitido.',
  invalid_timezone: 'Fuso horário não reconhecido.',
  invalid_price: 'Confira o preço.',
  invalid_duration: 'Confira a duração.',
  too_long: 'Duração e intervalo somados não podem passar de 4 horas.',
  logo_too_big: 'A imagem é grande demais. Use uma imagem menor (até cerca de 80 KB).',
  invalid_format: 'Este arquivo não é uma cópia de segurança deste sistema.',
  unsupported_version: 'Esta cópia de segurança é de uma versão mais nova do sistema.',
  'permission-denied': 'Não foi possível concluir. Atualize a página e tente de novo.',
};

export function errorText(e) {
  return ERRORS[e?.code] || 'Algo deu errado. Tente de novo em instantes.';
}
