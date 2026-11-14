// Pontos de partida por tipo de negócio, usados na primeira configuração.
// Preços e durações são apenas sugestões para a profissional ajustar.

const svc = (name, price, duration, buffer = 10, description = '') => ({ name, price, duration, buffer, description, active: true });

export const SEGMENTS = {
  manicure: {
    label: 'Manicure e pedicure', accent: '#8b2f4b',
    services: [svc('Mão', 3500, 45), svc('Pé', 4000, 50), svc('Mão + pé', 7000, 90), svc('Esmaltação em gel', 8000, 75), svc('Alongamento em gel', 16000, 150)],
  },
  barbearia: {
    label: 'Barbearia', accent: '#1f4d46',
    services: [svc('Corte', 4000, 30, 5), svc('Barba', 3000, 25, 5), svc('Corte + barba', 6500, 55, 5), svc('Sobrancelha', 1500, 10, 5)],
  },
  cabeleireiro: {
    label: 'Cabeleireiro', accent: '#6b3fa0',
    services: [svc('Corte', 6000, 45), svc('Escova', 5000, 45), svc('Hidratação', 8000, 60), svc('Coloração', 15000, 120, 15)],
  },
  sobrancelhas: {
    label: 'Sobrancelhas e cílios', accent: '#7a4a2b',
    services: [svc('Design de sobrancelhas', 3500, 30, 5), svc('Design com henna', 5000, 45, 5), svc('Extensão de cílios', 13000, 120, 10), svc('Manutenção de cílios', 8000, 75, 10)],
  },
  estetica: {
    label: 'Estética', accent: '#2f5f8a',
    services: [svc('Limpeza de pele', 12000, 75), svc('Massagem relaxante', 11000, 60), svc('Drenagem linfática', 10000, 60), svc('Depilação (meia perna)', 4500, 30)],
  },
};

export const ACCENTS = ['#8b2f4b', '#a23b5e', '#6b3fa0', '#2f5f8a', '#1f4d46', '#4a6b2f', '#7a4a2b', '#a14a2a', '#3a3a44'];

export const TIMEZONES = [
  ['America/Manaus', 'Manaus (AM, RO, RR, MT, MS)'],
  ['America/Sao_Paulo', 'Brasília (maior parte do Brasil)'],
  ['America/Rio_Branco', 'Rio Branco (AC)'],
  ['America/Noronha', 'Fernando de Noronha'],
];
