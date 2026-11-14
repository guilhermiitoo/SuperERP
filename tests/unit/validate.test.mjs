import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, normalizePhone, fmtPhone } from '../../public/js/core/validate.js';
import { randomToken, newBid } from '../../public/js/core/ids.js';

test('normalizeName apara, junta espaços e remove caracteres de controle', () => {
  assert.equal(normalizeName('  Maria   da  Silva \n'), 'Maria da Silva');
  assert.equal(normalizeName('Ana\u0000​'), 'Ana');
});

test('normalizeName aceita acentos e emoji, mas exige ao menos duas letras', () => {
  assert.equal(normalizeName('Conceição 💅'), 'Conceição 💅');
  assert.equal(normalizeName('A'), '');
  assert.equal(normalizeName('12345'), '');
  assert.equal(normalizeName(''), '');
  assert.equal(normalizeName(null), '');
});

test('normalizeName mantém texto com aparência de HTML como texto e limita a 80 caracteres', () => {
  assert.equal(normalizeName('<b>Bia</b>'), '<b>Bia</b>');
  assert.equal(normalizeName('x'.repeat(200)).length, 80);
});

test('normalizePhone aceita máscara, espaços e +55', () => {
  assert.equal(normalizePhone('(92) 99123-4567'), '92991234567');
  assert.equal(normalizePhone('+55 92 99123 4567'), '92991234567');
  assert.equal(normalizePhone('5592991234567'), '92991234567');
  assert.equal(normalizePhone('092 99123-4567'), '92991234567');
  assert.equal(normalizePhone('92 3234-5678'), '9232345678');
});

test('normalizePhone recusa números incompletos ou sem DDD', () => {
  assert.equal(normalizePhone('99123-4567'), '');
  assert.equal(normalizePhone('123'), '');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone('0092991234567999'), '');
});

test('fmtPhone exibe no formato brasileiro', () => {
  assert.equal(fmtPhone('92991234567'), '(92) 99123-4567');
  assert.equal(fmtPhone('9232345678'), '(92) 3234-5678');
});

test('randomToken é imprevisível, seguro para URL e tem o tamanho esperado', () => {
  const a = randomToken();
  const b = randomToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.match(newBid(), /^[A-Za-z0-9_-]{20}$/);
});
