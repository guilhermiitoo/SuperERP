// Normalização e validação dos dados digitados pela cliente.
// As mesmas condições são conferidas pelas regras do Firestore.

const CONTROL = /[\u0000-\u001F\u007F-\u009F​-‍⁠﻿]/g;

/** Nome limpo, ou '' se não for aceitável. O texto é sempre tratado como texto, nunca como HTML. */
export function normalizeName(input) {
  const clean = String(input ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  const cut = Array.from(clean).slice(0, 80).join('').trim();
  return /\p{L}.*\p{L}/u.test(cut) ? cut : '';
}

/** Telefone brasileiro com DDD, só dígitos (10 ou 11), ou '' se inválido. */
export function normalizePhone(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1);
  return /^[1-9][1-9][0-9]{8,9}$/.test(d) ? d : '';
}

export function fmtPhone(digits) {
  const d = String(digits ?? '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/** Texto livre curto (descrições, endereço, aviso): limpa controles e limita o tamanho. */
export function cleanText(input, max = 200) {
  return Array.from(String(input ?? '').replace(CONTROL, ' ').replace(/[ \t]+/g, ' ').trim()).slice(0, max).join('');
}
