// Constantes de negócio compartilhadas pelo aplicativo e espelhadas em firestore.rules.
// Ao mudar qualquer valor aqui, mude também nas regras e rode `npm run test:rules`.

/** Ocupação máxima de uma reserva (duração + intervalo): 48 átomos = 4 horas. */
export const MAX_CLAIM_ATOMS = 48;

/** Uma solicitação pendente precisa ser respondida até este tempo antes do início. */
export const APPROVAL_MARGIN_MIN = 60;

/** No modo aprovação, a antecedência mínima nunca é menor que isto. */
export const APPROVAL_MIN_ADVANCE_MIN = 90;

/** Quantos dias além da janela pública o painel mantém materializados. */
export const MATERIALIZE_MARGIN_DAYS = 30;

export const AGENDA_ID = 'main';
