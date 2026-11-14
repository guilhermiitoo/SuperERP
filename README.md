# Agenda Base

Sistema de agendamento por link para negócios de uma profissional — manicure, barbearia,
cabeleireiro, sobrancelhas, estética. A cliente escolhe serviço, dia e horário pelo celular, sem criar
conta. A profissional organiza o dia pelo painel, também no celular.

*"Agenda Base" é um nome provisório. O negócio "Studio Aurora" e todas as clientes da demonstração são
fictícios.*

## Para quem é

- **Cliente:** abre o link, escolhe o serviço, toca no dia e no horário, informa nome e telefone e
  recebe a confirmação (ou o aviso de que está aguardando aprovação), com um link próprio para
  remarcar, cancelar e adicionar ao calendário.
- **Profissional:** vê em segundos quem atende hoje, qual é o próximo atendimento e o que precisa de
  aprovação; faz reserva manual, bloqueia horário, remarca, cancela, marca concluído/não veio, busca
  clientes e fala com elas pelo WhatsApp.
- **Instalador:** instala a mesma base para outro negócio mudando só `public/config.js`; nome, cor,
  logo, serviços, horários e regras são configurados pelo painel.

## Experimentar agora (demonstração, sem nenhuma conta)

Requer Node.js 20+.

```bash
npm install
```

```bash
npm run dev
```

- Cliente: <http://127.0.0.1:5173/>
- Painel: <http://127.0.0.1:5173/painel.html> → "Entrar na demonstração"

A demonstração guarda tudo só no navegador (`localStorage`) e serve para conhecer o produto. **Produção
usa o Firebase** — veja [docs/INSTALACAO.md](docs/INSTALACAO.md).

## Como é feito

- HTML, CSS e JavaScript em módulos, **sem etapa de build para publicar** (o SDK do Firebase e as fontes
  estão em `public/vendor`, gerados com `npm run vendor`).
- **Firebase Authentication** (login da profissional) + **Cloud Firestore** (dados) + **Hosting**.
  Sem Cloud Functions: tudo cabe no plano gratuito (Spark).
- **A agenda é protegida no servidor:** cada dia é um documento com blocos de 5 minutos; reserva e dia
  são gravados juntos e as regras do Firestore recusam qualquer sobreposição — mesmo de um cliente
  adulterado, mesmo com duas pessoas confirmando no mesmo instante.

```
public/              site publicável (index.html = cliente, painel.html = profissional)
  config.js          configuração da instalação (demo ou firebase)
  js/core/           regras de negócio puras: tempo, disponibilidade, reservas, ics, whatsapp, backup
  js/data/           camada de dados: store.js (orquestração), firebase.js, demo.js
  js/ui/             componentes de interface
  js/public/         área da cliente
  js/admin/          painel (Hoje, Agenda, Clientes, Ajustes)
firestore.rules      a camada confiável
tests/               unidade, regras (emulador), navegador (demo e emulador)
docs/                documentação
```

## Testes

```bash
npm test
```

Roda testes de unidade, as regras no emulador do Firebase (precisa de Java 11+) e os testes de
navegador (Playwright/Chromium). Resultados registrados em [docs/TESTES.md](docs/TESTES.md).

## Documentação

- [docs/PLANO.md](docs/PLANO.md) — escopo, decisões técnicas e etapas
- [docs/REGRAS.md](docs/REGRAS.md) — regras de negócio (estados, disponibilidade, concorrência, privacidade, exportação)
- [docs/ENTREGA.md](docs/ENTREGA.md) — **roteiro de entrega**: conta do negócio, aviso por e-mail grátis, WhatsApp Business
- [docs/INSTALACAO.md](docs/INSTALACAO.md) — criar o projeto Firebase, publicar, criar a conta da proprietária
- [docs/PILOTO-MANICURE.md](docs/PILOTO-MANICURE.md) — configuração e roteiro do primeiro cliente
- [docs/CUSTOS.md](docs/CUSTOS.md) — cotas gratuitas, o que exige faturamento, limitações
- [docs/WHATSAPP.md](docs/WHATSAPP.md) — envio manual hoje e como automatizar no futuro
- [docs/TESTES.md](docs/TESTES.md) — o que foi verificado e o que falta

## Situação

Pronto para **piloto assistido**, não declarado "pronto para produção": a publicação em um projeto
Firebase real, o e-mail de redefinição de senha real e o App Check dependem da conta do negócio e
ainda não foram feitos. Veja as pendências em [docs/TESTES.md](docs/TESTES.md).
