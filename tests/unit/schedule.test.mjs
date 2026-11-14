import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDay, claim, listSlots, nextDayWithSlots, todayOf, holdExpiresMs } from '../../public/js/core/schedule.js';
import { instantOf } from '../../public/js/core/time.js';
import { settings, svc, MONDAY, NOW, MANAUS, at } from './_fixtures.mjs';

const dayDoc = (s = settings(), day = MONDAY, blocks = []) => ({ day, busy: {}, holds: {}, ...buildDay(s, day, blocks) });
const ctx = (over = {}) => ({ nowMs: NOW, settings: settings(), actor: 'public', ...over });
const labels = (slots) => slots.map((s) => s.label);
const occupy = (doc, start, n) => { for (let i = start; i < start + n; i++) doc.busy[i] = true; };

test('buildDay marca como indisponível tudo fora do expediente e a pausa do almoço', () => {
  const d = dayDoc();
  assert.equal(d.shut, false);
  assert.equal(d.off[at(8, 55)], true);
  assert.equal(d.off[at(9)], undefined);
  assert.equal(d.off[at(11, 55)], undefined);
  assert.equal(d.off[at(12)], true);
  assert.equal(d.off[at(12, 55)], true);
  assert.equal(d.off[at(13)], undefined);
  assert.equal(d.off[at(18)], true);
  assert.equal(Object.keys(d.off).length, 288 - (3 + 5) * 12);
});

test('buildDay fecha o dia sem expediente (domingo)', () => {
  const d = dayDoc(settings(), 20261115);
  assert.equal(d.shut, true);
  assert.deepEqual(d.off, {});
});

test('exceção por data fecha um dia normalmente aberto', () => {
  const d = dayDoc(settings({ exceptions: { [MONDAY]: { closed: true } } }));
  assert.equal(d.shut, true);
});

test('exceção por data pode trocar o horário do dia', () => {
  const d = dayDoc(settings({ exceptions: { [MONDAY]: { periods: [{ s: 14 * 60, e: 16 * 60 }] } } }));
  assert.equal(d.off[at(9)], true);
  assert.equal(d.off[at(14)], undefined);
  assert.equal(d.off[at(16)], true);
});

test('bloqueio de horário vira átomos indisponíveis; bloqueio do dia inteiro fecha o dia', () => {
  const d = dayDoc(settings(), MONDAY, [{ day: MONDAY, s: 10 * 60, e: 11 * 60 }]);
  assert.equal(d.off[at(10)], true);
  assert.equal(d.off[at(10, 55)], true);
  assert.equal(d.off[at(11)], undefined);
  const full = dayDoc(settings(), MONDAY, [{ day: MONDAY, allDay: true }]);
  assert.equal(full.shut, true);
});

test('claim ocupa duração + intervalo em átomos de 5 minutos', () => {
  assert.equal(claim(dayDoc(), at(9), svc({ duration: 45, buffer: 10 })), 11);
  assert.equal(claim(dayDoc(), at(9), svc({ duration: 90, buffer: 10 })), 20);
});

test('claim recusa atendimento que cruzaria o almoço', () => {
  assert.equal(claim(dayDoc(), at(11, 30), svc({ duration: 45 })), 0);
});

test('o atendimento precisa terminar dentro do expediente', () => {
  assert.equal(claim(dayDoc(), at(17, 30), svc({ duration: 45, buffer: 0 })), 0);
  assert.equal(claim(dayDoc(), at(17, 15), svc({ duration: 45, buffer: 0 })), 9);
});

test('o intervalo após o atendimento pode passar do fim do expediente ou entrar na pausa', () => {
  // termina 18:00 em ponto; os 10 min de intervalo não cabem, e não precisam caber
  assert.equal(claim(dayDoc(), at(17, 15), svc({ duration: 45, buffer: 10 })), 9);
  // termina 11:55; só 5 min do intervalo cabem antes do almoço
  assert.equal(claim(dayDoc(), at(11, 10), svc({ duration: 45, buffer: 10 })), 10);
});

test('o intervalo nunca pode cair sobre outra reserva', () => {
  const d = dayDoc();
  occupy(d, at(10), 11);
  assert.equal(claim(d, at(9, 15), svc({ duration: 45, buffer: 10 })), 0); // intervalo invadiria 10:00
  assert.equal(claim(d, at(9, 5), svc({ duration: 45, buffer: 10 })), 11);
});

test('claim recusa sobreposição com reserva existente e com bloqueio', () => {
  const d = dayDoc(settings(), MONDAY, [{ day: MONDAY, s: 15 * 60, e: 16 * 60 }]);
  occupy(d, at(9), 11);
  assert.equal(claim(d, at(9, 30), svc()), 0);
  assert.equal(claim(d, at(14, 30), svc()), 0);
  assert.equal(claim(d, at(13), svc()), 11);
});

test('claim recusa dia fechado, início fora do dia e duração inválida', () => {
  assert.equal(claim(dayDoc(settings(), 20261115), at(9), svc()), 0);
  assert.equal(claim(dayDoc(), 287, svc()), 0);
  assert.equal(claim(dayDoc(), -1, svc()), 0);
  assert.equal(claim(dayDoc(), at(9), svc({ duration: 0 })), 0);
  assert.equal(claim(dayDoc(), at(9), svc({ duration: 250, buffer: 0 })), 0); // acima de 4 h
});

test('listSlots oferece inícios no passo configurado, independente da duração', () => {
  const s = settings({ rules: { slotStepMin: 30 } });
  const short = labels(listSlots(dayDoc(s), svc({ duration: 30, buffer: 0 }), ctx({ settings: s })));
  assert.deepEqual(short.slice(0, 6), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
  const long = labels(listSlots(dayDoc(s), svc({ duration: 90, buffer: 10 }), ctx({ settings: s })));
  assert.deepEqual(long.slice(0, 4), ['09:00', '09:30', '10:00', '10:30']); // 10:30 termina 12:00
  assert.ok(!long.includes('11:00'));
  const step15 = settings({ rules: { slotStepMin: 15 } });
  assert.deepEqual(labels(listSlots(dayDoc(step15), svc(), ctx({ settings: step15 }))).slice(0, 3), ['09:00', '09:15', '09:30']);
});

test('listSlots encosta uma opção logo depois de uma reserva quando isso evita um buraco de 15 min ou mais', () => {
  const d = dayDoc();
  occupy(d, at(9), 14); // 09:00–10:10 (60 + 10): a grade só voltaria às 10:30
  assert.deepEqual(labels(listSlots(d, svc(), ctx())).slice(0, 3), ['10:10', '10:30', '11:00']);
});

test('listSlots não oferece horário quebrado colado em um horário da grade', () => {
  const d = dayDoc();
  occupy(d, at(9), 11); // 09:00–09:55: 09:55 ficaria a 5 min das 10:00
  assert.deepEqual(labels(listSlots(d, svc(), ctx())).slice(0, 2), ['10:00', '10:30']);
});

test('listSlots respeita a antecedência mínima no fuso do estabelecimento', () => {
  // agora = segunda 08:00 em Manaus; antecedência de 2 h → primeiro horário 10:00
  const nowMs = instantOf(MONDAY, 8 * 60, MANAUS);
  assert.equal(labels(listSlots(dayDoc(), svc(), ctx({ nowMs })))[0], '10:00');
  // 22:00 de domingo em Manaus (já é segunda em UTC): segunda inteira continua disponível
  const sundayNight = instantOf(20261115, 22 * 60, MANAUS);
  assert.equal(labels(listSlots(dayDoc(), svc(), ctx({ nowMs: sundayNight })))[0], '09:00');
});

test('listSlots não oferece dia além da janela nem dia passado', () => {
  const s = settings({ rules: { maxDays: 1 } });
  assert.deepEqual(listSlots(dayDoc(s), svc(), ctx({ settings: s })), []); // segunda está a 2 dias
  const s2 = settings({ rules: { maxDays: 2 } });
  assert.ok(listSlots(dayDoc(s2), svc(), ctx({ settings: s2 })).length > 0);
  assert.deepEqual(listSlots(dayDoc(settings(), 20261113), svc(), ctx()), []);
});

test('no modo aprovação a antecedência mínima é de pelo menos 90 minutos', () => {
  const s = settings({ rules: { mode: 'approval', minAdvanceMin: 30 } });
  const nowMs = instantOf(MONDAY, 9 * 60, MANAUS);
  assert.equal(labels(listSlots(dayDoc(s), svc(), ctx({ settings: s, nowMs })))[0], '10:30');
});

test('a proprietária não tem antecedência mínima nem janela máxima', () => {
  const s = settings({ rules: { maxDays: 1 } });
  const nowMs = instantOf(MONDAY, 9 * 60 + 10, MANAUS);
  const got = labels(listSlots(dayDoc(s), svc(), ctx({ settings: s, nowMs, actor: 'owner' })));
  assert.equal(got[0], '09:00');
});

test('retenção pendente vence no prazo ou 1 h antes do início, o que vier primeiro', () => {
  const start = instantOf(MONDAY, 10 * 60, MANAUS);
  const c = start - 30 * 3600000;
  assert.equal(holdExpiresMs({ s: at(10), n: 11, c, a: 720 }, MONDAY, MANAUS), c + 720 * 60000);
  assert.equal(holdExpiresMs({ s: at(10), n: 11, c: start - 3 * 3600000, a: 720 }, MONDAY, MANAUS), start - 3600000);
});

test('retenção vencida não bloqueia o horário; retenção vigente bloqueia', () => {
  const d = dayDoc();
  occupy(d, at(10), 11);
  const c = instantOf(MONDAY, 10 * 60, MANAUS) - 40 * 3600000;
  d.holds.abc = { s: at(10), n: 11, c, a: 60 };
  assert.ok(labels(listSlots(d, svc(), ctx({ nowMs: c + 61 * 60000 }))).includes('10:00'));
  assert.ok(!labels(listSlots(d, svc(), ctx({ nowMs: c + 59 * 60000 }))).includes('10:00'));
});

test('serviço mais longo que qualquer janela livre deixa o dia sem horários', () => {
  assert.deepEqual(listSlots(dayDoc(), svc({ duration: 240, buffer: 0 }), ctx()).length, 3); // 13:00, 13:30, 14:00
  const sat = dayDoc(settings(), 20261121);
  assert.deepEqual(listSlots(sat, svc({ duration: 245, buffer: 0 }), ctx()), []);
});

test('nextDayWithSlots encontra o próximo dia com horário', () => {
  const s = settings();
  const days = {};
  for (const day of [20261114, 20261115, 20261116, 20261117]) days[day] = dayDoc(s, day);
  occupy(days[20261116], 0, 288);
  // sábado 14: agora 08:00, antecedência 2 h → ainda há horários às 10:00
  assert.equal(nextDayWithSlots(days, 20261114, svc(), ctx()), 20261114);
  assert.equal(nextDayWithSlots(days, 20261115, svc(), ctx()), 20261117);
  assert.equal(nextDayWithSlots(days, 20261118, svc(), ctx()), null);
});

test('todayOf usa o fuso do estabelecimento', () => {
  assert.equal(todayOf(Date.parse('2026-11-15T03:30:00Z'), MANAUS), 20261114);
});
