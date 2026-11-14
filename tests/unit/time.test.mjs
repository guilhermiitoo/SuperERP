import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayIdOf, partsOf, addDays, weekdayOf, daysBetween, instantOf, localOf, offsetMinutesOf,
  fmtTime, parseTime, fmtDuration, fmtDayLong, fmtDayShort, fmtMoney, ATOM_MIN, ATOMS_PER_DAY,
} from '../../public/js/core/time.js';

const MANAUS = -240;

test('um dia tem 288 átomos de 5 minutos', () => {
  assert.equal(ATOM_MIN, 5);
  assert.equal(ATOMS_PER_DAY, 288);
});

test('dayIdOf e partsOf são inversos', () => {
  assert.equal(dayIdOf(2026, 11, 14), 20261114);
  assert.deepEqual(partsOf(20261114), { y: 2026, m: 11, d: 14 });
});

test('addDays atravessa mês, ano e ano bissexto', () => {
  assert.equal(addDays(20261130, 1), 20261201);
  assert.equal(addDays(20261231, 1), 20270101);
  assert.equal(addDays(20280228, 1), 20280229);
  assert.equal(addDays(20270301, -1), 20270228);
  assert.equal(addDays(20261114, 30), 20261214);
});

test('weekdayOf devolve 0 para domingo', () => {
  assert.equal(weekdayOf(20261114), 6); // sábado
  assert.equal(weekdayOf(20261115), 0); // domingo
});

test('daysBetween conta dias de calendário', () => {
  assert.equal(daysBetween(20261114, 20261214), 30);
  assert.equal(daysBetween(20261114, 20261113), -1);
});

test('instantOf converte horário local de Manaus para o instante UTC', () => {
  assert.equal(new Date(instantOf(20261114, 9 * 60, MANAUS)).toISOString(), '2026-11-14T13:00:00.000Z');
});

test('localOf usa o dia do estabelecimento, não o dia UTC', () => {
  // 23:30 em Manaus já é 03:30 do dia seguinte em UTC
  const ms = Date.parse('2026-11-15T03:30:00Z');
  assert.deepEqual(localOf(ms, MANAUS), { day: 20261114, minutes: 23 * 60 + 30 });
});

test('localOf e instantOf são inversos', () => {
  const ms = instantOf(20270101, 0, MANAUS);
  assert.deepEqual(localOf(ms, MANAUS), { day: 20270101, minutes: 0 });
});

test('offsetMinutesOf lê o deslocamento do fuso IANA', () => {
  const ms = Date.parse('2026-11-14T12:00:00Z');
  assert.equal(offsetMinutesOf('America/Manaus', ms), -240);
  assert.equal(offsetMinutesOf('America/Sao_Paulo', ms), -180);
  assert.equal(offsetMinutesOf('UTC', ms), 0);
});

test('fmtTime e parseTime', () => {
  assert.equal(fmtTime(545), '09:05');
  assert.equal(fmtTime(0), '00:00');
  assert.equal(parseTime('09:05'), 545);
  assert.equal(parseTime('24:00'), 1440);
  assert.equal(parseTime('9h'), null);
  assert.equal(parseTime('25:00'), null);
});

test('fmtDuration em linguagem natural', () => {
  assert.equal(fmtDuration(45), '45 min');
  assert.equal(fmtDuration(60), '1 h');
  assert.equal(fmtDuration(90), '1 h 30 min');
});

test('datas por extenso em português', () => {
  assert.equal(fmtDayLong(20261114), 'sábado, 14 de novembro');
  assert.equal(fmtDayShort(20261114), 'sáb., 14/11');
});

test('fmtMoney formata centavos em reais', () => {
  assert.equal(fmtMoney(3500), 'R$ 35,00');
  assert.equal(fmtMoney(123456), 'R$ 1.234,56');
  assert.equal(fmtMoney(0), 'R$ 0,00');
});
