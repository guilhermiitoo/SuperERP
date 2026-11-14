// Dados fictícios da demonstração. Nenhum nome, telefone, endereço ou preço aqui é real.

import { defaultSettings } from '../core/settings.js';
import { addDays } from '../core/time.js';
import { todayOf } from '../core/schedule.js';

export const DEMO_SERVICES = [
  { id: 'mao', name: 'Mão', description: 'Cutilagem e esmaltação tradicional.', price: 3500, duration: 45, buffer: 10, order: 1 },
  { id: 'pe', name: 'Pé', description: 'Cutilagem, lixamento e esmaltação.', price: 4000, duration: 50, buffer: 10, order: 2 },
  { id: 'mao-pe', name: 'Mão + pé', description: 'Os dois juntos, em uma visita só.', price: 7000, duration: 90, buffer: 10, order: 3 },
  { id: 'gel', name: 'Esmaltação em gel', description: 'Brilho que dura até três semanas.', price: 8000, duration: 75, buffer: 10, order: 4 },
  { id: 'alongamento', name: 'Alongamento em gel', description: 'Aplicação completa com molde.', price: 16000, duration: 150, buffer: 10, order: 5 },
  { id: 'spa', name: 'Spa dos pés', description: 'Esfoliação, hidratação e massagem.', price: 6500, duration: 60, buffer: 10, order: 6 },
];

const CLIENTS = [
  ['Marina Lopes', '92900000001'], ['Jéssica Andrade', '92900000002'], ['Carla Menezes', '92900000003'],
  ['Bianca Farias', '92900000004'], ['Renata Queiroz', '92900000005'], ['Tainá Barros', '92900000006'],
  ['Luana Peixoto', '92900000007'], ['Sabrina Couto', '92900000008'],
];

// [dias a partir de hoje, horário, serviço]
const AGENDA = [
  [0, '09:00', 'mao-pe'], [0, '11:00', 'mao'], [0, '14:00', 'gel'], [0, '16:30', 'pe'],
  [1, '09:30', 'alongamento'], [1, '15:00', 'mao'], [2, '10:00', 'spa'], [3, '13:30', 'mao-pe'],
];

export function demoSettings() {
  const s = defaultSettings();
  s.business = {
    ...s.business,
    name: 'Studio Aurora (demonstração)',
    tagline: 'Unhas bem cuidadas, com hora marcada',
    phone: '92900000000',
    address: 'Rua das Acácias, 123 — Centro, Manaus/AM (endereço fictício)',
  };
  return s;
}

/** Preenche a demonstração uma única vez. Chamar de novo não duplica nada. */
export async function seedDemo(store) {
  if ((await store.loadBusiness()).settings) return false;
  const wasOwner = await store.isOwner();
  if (!wasOwner) await store.signIn('demo', 'demo');
  const settings = await store.saveSettings(demoSettings());
  for (const s of DEMO_SERVICES) await store.saveService({ ...s, active: true });
  await store.syncDays();

  const today = todayOf(store.now(), settings.utcOffsetMin);
  for (const [i, [offset, time, serviceId]] of AGENDA.entries()) {
    const [h, m] = time.split(':').map(Number);
    const [name, phone] = CLIENTS[i % CLIENTS.length];
    try {
      const b = await store.createBooking({
        serviceId, day: addDays(today, offset), start: (h * 60 + m) / 5, customer: { name, phone }, source: 'manual',
      });
      // o que já passou hoje aparece como atendido, para a tela "Hoje" ter os dois estados
      if (b.startAt + b.service.duration * 60000 < store.now()) await store.finishBooking(b.token, 'done');
    } catch {
      // dia fechado ou horário indisponível: a demonstração segue sem essa reserva
    }
  }
  if (!wasOwner) await store.signOut();
  return true;
}
