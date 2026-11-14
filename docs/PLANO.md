# Agenda Base — Plano de Implementação

> **Para quem for executar:** as etapas usam caixas (`- [ ]`) para acompanhamento. Cada tarefa segue
> teste-primeiro: escrever o teste, ver falhar, implementar o mínimo, ver passar, commit.
> O estado real de cada verificação fica em [`TESTES.md`](TESTES.md).

**Objetivo:** sistema web de agendamento por link para uma profissional autônoma, com painel no celular,
uma instalação por negócio e operação inicial dentro de cotas gratuitas.

**Arquitetura:** site estático (HTML/CSS/JS em módulos ES, sem build para publicar) falando direto com
Firebase Authentication e Cloud Firestore. Não há servidor próprio nem Cloud Functions: a camada confiável
são as **Regras de Segurança do Firestore**, que validam cada reserva e impedem sobreposição dentro da
mesma gravação atômica. A lógica de negócio é pura (`public/js/core`) e é a mesma usada pelo modo
demonstração (dados fictícios em `localStorage`) e pelo modo Firebase.

**Tecnologias:** JavaScript (ES2022), Firebase JS SDK 12 (Auth + Firestore Lite, empacotado em
`public/vendor`), Firebase Emulator Suite, `node:test`, Playwright, esbuild (só para gerar o vendor).

**Especificação:** o briefing do proprietário (resumido em [`../PRODUCT.md`](../PRODUCT.md)) e as regras
de negócio em [`REGRAS.md`](REGRAS.md).

## Restrições globais

- Textos em português do Brasil, curtos; nenhum termo técnico nos fluxos da cliente.
- Uso principal no celular; alvos de toque de pelo menos 44 px; WCAG 2.2 AA.
- Reserva só é mostrada como feita depois da gravação definitiva no servidor. Sem fila offline.
- Nenhuma senha, chave privada ou dado real no repositório. Demonstração identificada como fictícia.
- Operar sem faturamento habilitado (plano Spark): sem Cloud Functions, sem Cloud Storage.
- Fuso do estabelecimento em todos os cálculos; inicial `America/Manaus` (UTC−4).
- Valores iniciais: confirmação automática, antecedência mínima 2 h, agenda aberta 30 dias, intervalo
  de 10 min após o atendimento, cancelamento/remarcação pela cliente até 12 h antes. Todos editáveis.
- Sem automação não oficial de WhatsApp; nenhuma mensagem simulada apresentada como enviada.

## Decisões técnicas

### 1. Por que Firebase sem Cloud Functions

Cloud Functions, backups agendados e Cloud Storage exigem o plano Blaze (faturamento habilitado).
Firestore, Authentication e Hosting têm cota sem custo no plano Spark. Para caber nela, tudo o que
precisa ser confiável foi levado para as Regras de Segurança, que rodam no servidor do Firestore.
O que as regras não conseguem fazer (notificações, limite por IP, lembretes) está documentado como
limitação em [`CUSTOS.md`](CUSTOS.md) e [`WHATSAPP.md`](WHATSAPP.md), com o caminho pago mais barato.

### 2. Como a sobreposição é impedida (o ponto central)

O tempo de cada dia é dividido em **átomos de 5 minutos** (288 por dia). Cada dia da agenda é **um
documento** público e sem dados pessoais:

```
agendas/{agendaId}/days/{AAAAMMDD}
  shut:  bool                 dia fechado
  off:   { "108": true, … }   átomos indisponíveis (fora do expediente, pausa, folga, bloqueio)
  busy:  { "120": true, … }   átomos ocupados por reservas (duração + intervalo)
  holds: { bid: {s, n, c, a} } solicitações pendentes (início, tamanho, criada em, prazo em min)
  op:    { bid, rev }         última operação (elo com a reserva gravada no mesmo lote)
```

Toda operação de reserva grava **no mesmo lote atômico** o documento da reserva e o documento do dia.
As regras exigem, para o documento do dia, que:

- as chaves **adicionadas** a `busy` sejam exatamente o intervalo `[início, início+n)` da reserva;
- **nenhuma chave existente mude** e nenhuma chave de `off` seja atingida;
- as chaves **removidas** sejam exatamente o intervalo de uma reserva que está sendo cancelada,
  recusada, expirada ou remarcada no mesmo lote.

Como o documento do dia é único, o Firestore serializa as gravações: de duas reservas simultâneas
para períodos que se cruzam, a segunda é avaliada contra o estado já gravado pela primeira e é
**negada pela regra**, mesmo que o cliente seja malicioso e não use transação. Não existe o passo
"consultar se está livre e depois salvar": a verificação e a gravação são a mesma operação no servidor.
Durações variáveis funcionam porque o intervalo é um conjunto de átomos, não um "slot" fixo.
A remarcação adiciona os átomos novos e remove os antigos no mesmo lote: ou acontece tudo, ou nada.

Reserva manual (painel) e pública passam pela mesma regra do documento do dia.

### 3. Privacidade e link de gerenciamento

```
bookings/{token}   reserva completa (nome, telefone, serviço, horário, estado)
locks/{bid}        { token } índice privado; só as regras e a proprietária leem
```

- `token` são 32 bytes aleatórios (base64url). O caminho do documento é a própria autorização:
  qualquer pessoa pode **ler um documento pelo token exato**, ninguém além da proprietária pode
  **listar**. Não há identificador sequencial e não há como enumerar.
- O `bid` (identificador público) aparece no documento do dia, mas não dá acesso a nada.
- O link usa o fragmento da URL (`#/r/<token>`), que não é enviado ao servidor de hospedagem nem
  aparece em cabeçalhos de referência.

### 4. Proprietária e primeiro acesso

A conta é criada pelo instalador no console do Firebase, junto com o documento `owners/{uid}`.
Regras: só é administradora a conta cujo `uid` existe em `owners`, e ninguém grava em `owners` pelo
aplicativo. Um visitante que crie uma conta por conta própria não ganha nenhum acesso.

### 5. Dias materializados

Os documentos de dia são criados e atualizados pelo painel (autenticado) a partir dos horários,
pausas, folgas e bloqueios. O público só reserva em dias que existem. O painel mantém os dias criados
até `dias à frente + 30`. Limitação: se o painel não for aberto por mais de 30 dias, os dias mais
distantes deixam de aparecer para as clientes até a próxima abertura.

### 6. Expiração sem servidor

Uma solicitação pendente vence em `min(criação + prazo, início − 1 h)`. Não há tarefa agendada:
o estado **efetivo** é calculado na leitura, as regras recusam aprovar depois do vencimento, e
qualquer cliente pode liberar os átomos de uma retenção vencida (a regra confere o vencimento contra
a reserva real). O painel grava o estado "expirado" quando é aberto.

### 7. Fuso horário

`config/public` guarda o nome IANA e o deslocamento fixo em minutos. As regras conferem que o
instante (`startAt`) corresponde ao dia/horário local informado. Fusos com horário de verão não são
suportados pela validação das regras (o Brasil não adota horário de verão desde 2019).

## Estrutura de arquivos

```
public/                      site publicável
  index.html                 área pública (cliente)
  painel.html                painel da profissional
  config.js                  configuração da instalação (padrão: demonstração)
  sw.js, *.webmanifest       PWA
  css/                       tokens, base, componentes, telas
  js/core/                   regras de negócio puras (testadas em Node)
    time.js                  átomos, datas, fuso, formatação
    schedule.js              expediente → átomos; cálculo de horários livres
    booking.js               estados, validações e planejamento das operações
    ics.js, whatsapp.js, validate.js, backup.js, ids.js
  js/data/                   store-firebase.js, store-demo.js, demo-seed.js, store.js
  js/ui/                     dom, ícones, folha (sheet), avisos, conexão
  js/public/                 fluxo de agendamento e página da reserva
  js/admin/                  login, Hoje, Agenda, Clientes, Ajustes
  vendor/                    Firebase SDK empacotado, fontes
firestore.rules              camada confiável
tests/unit, tests/rules, tests/e2e, tests/e2e-firebase
scripts/                     serve.mjs, build-vendor.mjs, criar-proprietaria.mjs
docs/
```

## Foco de revisão

Casos que a especificação implica e que mais provavelmente atingem uma pessoa real:

1. Relógio do celular errado: os horários oferecidos usam hora estimada do servidor; se a regra
   recusar por antecedência, a tela explica e recarrega os horários. (Tarefa 5, teste de UI.)
2. Link aberto no navegador embutido do WhatsApp/Instagram: sem depender de `localStorage` para
   concluir a reserva; o link da reserva funciona em qualquer navegador. (Tarefa 7.)
3. Nome com emoji, acento ou HTML: gravado como texto e sempre escapado na exibição. (Tarefas 3 e 8.)
4. Telefone colado com máscara, `+55` ou espaços: normalizado antes de validar. (Tarefa 3.)
5. Serviço mais longo que qualquer janela livre do dia: o dia aparece sem horários e a tela oferece
   o próximo dia disponível. (Tarefas 3 e 7.)

## Tarefas

### Tarefa 1 — Tempo e datas (`core/time.js`)
Teste: `tests/unit/time.test.mjs`. Produz `dayIdOf`, `addDays`, `weekdayOf`, `instantOf(day, minutos, offset)`,
`localOf(ms, offset)`, `offsetMinutesOf(timeZone, ms)`, `fmtTime`, `fmtDayLong`.
- [ ] `instantOf(20261114, 540, -240)` é `2026-11-14T13:00:00Z`; `localOf` inverte.
- [ ] 23:30 de Manaus pertence ao dia local, não ao dia UTC.
- [ ] `offsetMinutesOf('America/Manaus')` é −240.

### Tarefa 2 — Expediente e horários livres (`core/schedule.js`)
Teste: `tests/unit/schedule.test.mjs`. Produz `buildDay(settings, day, blocks)`, `claim(dayDoc, start, service, now)`,
`listSlots(dayDoc, service, ctx)`, `nextDayWithSlots`.
- [ ] Serviços de durações diferentes ocupam átomos diferentes.
- [ ] Não cruza almoço, bloqueio nem reserva; termina dentro do expediente.
- [ ] O intervalo após o atendimento pode passar do fim do expediente/pausa, nunca sobre outra reserva.
- [ ] Opções de início seguem o passo configurado, sem confundir com duração.
- [ ] Antecedência mínima e janela máxima no fuso do estabelecimento.
- [ ] Retenção vencida não bloqueia.

### Tarefa 3 — Reservas (`core/booking.js`, `validate.js`, `ids.js`)
Teste: `tests/unit/booking.test.mjs`. Produz `planCreate`, `planCancel`, `planDecline`, `planApprove`,
`planReschedule`, `planFinish`, `planExpire`, `planReleaseHold`, `effectiveStatus`, `expiresAtMs`, `BookingError`.
- [ ] Automático confirma; aprovação deixa pendente com retenção.
- [ ] Cópia do serviço na reserva; mudar preço depois não altera a reserva.
- [ ] Cancelar libera átomos; remarcar no mesmo dia e em outro dia.
- [ ] Prazo da cliente para cancelar/remarcar; proprietária sem prazo.
- [ ] Nome/telefone normalizados e validados.

### Tarefa 4 — Regras do Firestore (`firestore.rules`)
Teste: `tests/rules/*.test.mjs` no emulador.
- [ ] Duas reservas simultâneas no mesmo período: uma aceita, outra negada.
- [ ] Cliente malicioso: reserva sem átomos, átomos sem reserva, sobrescrever átomo, horário fechado,
  serviço adulterado, fora da janela, com agenda pausada.
- [ ] Manual × pública concorrendo.
- [ ] Remarcação atômica; cancelamento libera; expiração libera; aprovação após o prazo negada.
- [ ] Visitante não lista reservas, não lê `locks`/`blocks`/`owners`, não escreve configuração.
- [ ] Token de uma cliente não dá acesso à reserva de outra.

### Tarefa 5 — Camada de dados (`js/data`)
Teste: `tests/unit/store-demo.test.mjs` e `tests/rules/store-firebase.test.mjs` (mesma bateria nos dois).
Interface única: `loadPublic`, `loadDays`, `createBooking`, `getBooking`, `cancelBooking`, `rescheduleBooking`,
`signIn`, `listBookings`, `approve/decline/finish`, `saveSettings`, `saveService`, `saveBlock`, `syncDays`,
`exportAll`, `importAll`.

### Tarefa 6 — Sistema visual (`css/`, `js/ui`)
Direção registrada em `.impeccable/surfaces/`. Tokens, tipografia, componentes, ícones.

### Tarefa 7 — Área pública
Teste: `tests/e2e/public.test.mjs`. Fluxo completo, horário tomado durante o preenchimento, dupla
submissão, sem conexão, link de gerenciamento, `.ics`, WhatsApp.

### Tarefa 8 — Painel
Teste: `tests/e2e/admin.test.mjs`. Hoje, Agenda, Clientes, Ajustes, aprovação, bloqueio, pausa,
reserva manual, exportação/importação.

### Tarefa 9 — PWA, acessibilidade e revisão visual
Service worker (só casca estática), manifestos, ícones; teclado, foco, contraste; capturas em
celular e desktop.

### Tarefa 10 — Documentação
README, REGRAS, PILOTO-MANICURE, INSTALACAO, CUSTOS, WHATSAPP, TESTES, `.env.example`.
