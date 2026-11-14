// Identificadores aleatórios. O token da reserva é a autorização da cliente: 256 bits de entropia.

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(byteLength = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** Identificador público da reserva. Não dá acesso a nada. */
export function newBid() {
  return randomToken(15);
}

export function newId() {
  return randomToken(12);
}
