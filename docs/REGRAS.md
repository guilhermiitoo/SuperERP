# Regras de negócio

Este documento descreve como a agenda se comporta. Cada regra tem um teste automatizado
correspondente (veja [TESTES.md](TESTES.md)). As regras de cálculo ficam em `public/js/core/` e a
proteção no servidor fica em `firestore.rules`.

## 1. Estados de uma reserva

| Estado | Quando | Ocupa a agenda? |
|---|---|---|
| **Pendente** (`pending`) | Criada pelo link no modo "com aprovação" | Sim, até ser aprovada, recusada ou expirar |
| **Confirmado** (`confirmed`) | Criada no modo automático, aprovada, ou reserva manual | Sim |
| **Concluído** (`done`) | Marcado pela profissional depois do início | Não muda nada na agenda |
| **Não compareceu** (`noshow`) | Marcado pela profissional depois do início | Não muda nada na agenda |
| **Cancelado** (`cancelled`) | Pela cliente (dentro do prazo) ou pela profissional | Não: o horário é liberado |
| **Recusado** (`declined`) | A profissional recusou a solicitação | Não: o horário é liberado |
| **Expirado** (`expired`) | A solicitação não foi respondida no prazo | Não: o horário é liberado |

"Concluído" e "Não compareceu" podem ser desfeitos (voltam para Confirmado), para corrigir um toque
errado. Só é possível marcar depois do horário de início.

## 2. Confirmação automática ou mediante aprovação

- **Automática** (padrão da demonstração): uma reserva válida é confirmada no mesmo instante.
- **Com aprovação**: a reserva nasce pendente, o horário fica **reservado para aquela cliente** e a tela
  diz claramente "Ainda não está confirmado", com o prazo de resposta.
- A reserva guarda o modo em que nasceu. **Trocar o modo só afeta reservas novas**: uma reserva criada no
  modo automático continua confirmada mesmo se ela for remarcada depois que o modo mudou.
- Reserva manual (feita pela profissional no painel) é sempre confirmada.

### Prazo de aprovação e reservas próximas do horário

O prazo de resposta é o **menor** entre:

1. o momento da solicitação + o "prazo para você responder" configurado (padrão: 12 horas);
2. **1 hora antes do início** do atendimento.

Assim o prazo nunca ultrapassa o início do atendimento, e a cliente sabe com pelo menos 1 hora de
antecedência se foi atendida.

Para que reservas próximas do horário não fiquem impossíveis de responder, **no modo com aprovação a
antecedência mínima é de pelo menos 1h30**, mesmo que a configuração diga menos. Na pior hipótese a
profissional tem 30 minutos para responder. Exemplo: às 10:00 a cliente pede 11:30 → prazo até 10:30.
Quem precisa de horário em cima da hora é orientada pela tela a falar pelo WhatsApp.

### Expiração sem servidor

Não existe um servidor ligado o tempo todo para "vencer" solicitações. Por isso:

- o estado **efetivo** é calculado na leitura: passou do prazo, a tela mostra "Expirado" e o horário
  deixa de bloquear a disponibilidade **imediatamente**, para todo mundo;
- o servidor **recusa aprovar** depois do prazo (a regra confere o horário do próprio servidor);
- quando alguém tenta reservar um horário preso por uma solicitação vencida, o aplicativo primeiro libera
  aquela retenção (qualquer visitante pode, e a regra confere no servidor que ela realmente venceu) e
  depois reserva;
- quando o painel é aberto, ele grava "Expirado" nas solicitações vencidas.

## 3. Disponibilidade

O dia é dividido em blocos ("átomos") de **5 minutos** — 288 por dia. Cada reserva ocupa um conjunto
contínuo de átomos. Isso permite serviços de qualquer duração múltipla de 5 minutos sem "encaixes" fixos.

Um horário de início é oferecido quando:

1. o **atendimento inteiro** (duração do serviço) cabe em tempo aberto: dentro do expediente, fora de
   pausas, folgas e bloqueios, e sem cruzar outra reserva;
2. o **intervalo depois do atendimento** não cai sobre outra reserva;
3. respeita a **antecedência mínima** e a **janela máxima** (quantos dias à frente);
4. a agenda não está **pausada** (pausa só vale para o link; a profissional continua reservando).

### Intervalo final × fim do expediente

O **atendimento** precisa terminar até o fim do período (ex.: 18:00). O **intervalo** depois dele (tempo
de limpeza) pode ser cortado pelo fim do expediente, por uma pausa ou por um bloqueio — não faz sentido
recusar o último horário do dia só porque a limpeza passaria das 18:00. O intervalo **nunca** pode
cair sobre a reserva seguinte.

Exemplo (expediente até 18:00, serviço de 45 min + 10 min de intervalo): 17:15 é oferecido (termina
18:00, o intervalo é cortado); 17:30 não é (terminaria 18:15).

### Frequência das opções × duração

"Opções de horário de 30 em 30 minutos" define **quando** um atendimento pode começar, não quanto dura.
Um serviço de 45 min com opções de 30 em 30 é oferecido às 09:00, 09:30, 10:00…

Para não deixar buracos, também é oferecido um início "quebrado" logo depois de uma reserva existente,
**se** esperar o próximo horário da grade desperdiçaria 15 minutos ou mais. Ex.: reserva até 10:10 →
oferece 10:10 e depois 10:30. Reserva até 09:55 → não oferece 09:55 (o 10:00 está a 5 minutos).

### Dia lotado ou fechado

A tela mostra "Sem horários livres neste dia" ou "Fechado neste dia" e oferece um botão para o próximo
dia com horário. Se não houver nenhum horário na janela, orienta a falar com o estabelecimento.

## 4. Proteção contra horário duplicado (o ponto mais importante)

A garantia está **no banco**, não na tela:

- cada dia da agenda é um único documento público (`agendas/main/days/AAAAMMDD`) com os átomos ocupados
  e **nenhum dado pessoal**;
- toda criação, remarcação, cancelamento, recusa e expiração grava **no mesmo lote atômico** a reserva e
  o documento do dia;
- as regras do Firestore exigem que os átomos acrescentados sejam **exatamente** os da reserva, que
  **nenhum** deles estivesse ocupado ou fora do expediente, e que os átomos liberados sejam exatamente os
  de uma reserva que está sendo encerrada naquele mesmo lote.

Como o documento do dia é único, o Firestore serializa as gravações: de duas reservas simultâneas que se
cruzam, a segunda é avaliada contra o estado que a primeira gravou e é **negada pelo servidor**, mesmo
que o aplicativo tenha sido adulterado e não use transação. Não existe "consultar se está livre e depois
salvar". A reserva manual passa pela mesma regra.

### Remarcação atômica

A remarcação ocupa o novo horário e libera o antigo **no mesmo lote**. Se o novo horário não estiver
livre, nada muda: a cliente continua com o horário original. Se der certo, o link da reserva continua o
mesmo.

## 5. Cancelamento e remarcação pela cliente

- Pelo link da reserva, até o **prazo configurado** (padrão: 12 horas antes). O prazo vigente no momento
  da reserva fica gravado nela — mudar a configuração depois não muda a regra de quem já reservou.
- Uma **solicitação pendente** pode ser cancelada pela cliente até o início (ela ainda não foi aceita).
- Passado o prazo, a tela orienta a falar com o estabelecimento. A profissional pode cancelar ou remarcar
  a qualquer momento.
- No modo com aprovação, remarcar pela cliente volta a pedir aprovação.

## 6. Serviços e histórico

Cada reserva guarda uma **cópia** do serviço (nome, preço, duração, intervalo). Mudar preço ou duração
depois **não altera** reservas existentes; vale para as próximas. O servidor confere que a cópia enviada
pela cliente é igual ao serviço ativo cadastrado (não dá para reservar "pagando" outro preço).

Um serviço inativo some do link e continua no painel. Excluir um serviço não afeta reservas feitas.

## 7. Fuso horário

Todos os cálculos e exibições usam o fuso do estabelecimento (inicial: `America/Manaus`, UTC−4), não o
do aparelho de quem acessa. O servidor confere que o instante gravado corresponde ao dia e horário locais
informados. Limitação: a conferência no servidor usa um deslocamento fixo, portanto **fusos com horário
de verão não são suportados** (o Brasil não adota horário de verão desde 2019). Se voltar a existir, será
preciso ajustar as regras.

O aplicativo compara o relógio do aparelho com a hora do servidor de hospedagem; se o celular estiver
com a hora errada, os horários oferecidos usam a hora estimada do servidor. Em qualquer caso, o servidor
do Firestore confere a antecedência com o próprio relógio.

## 8. Dias publicados

Os documentos de dia são criados e atualizados pelo painel (com login) a partir dos horários, pausas,
folgas e bloqueios. O painel mantém publicados os dias até **"dias à frente" + 30 dias**.

**Limitação:** se o painel ficar mais de 30 dias sem ser aberto, os dias mais distantes deixam de
aparecer no link até a próxima abertura. Na prática, a profissional abre o painel todos os dias.

Mudar o expediente não cancela reservas existentes fora do novo horário: a tela avisa e elas continuam
na agenda para a profissional decidir.

## 9. Privacidade

- A cliente não cria conta. O **link da reserva** contém um código aleatório de 256 bits; quem tem o link
  vê e gerencia **apenas aquela** reserva. Não há número sequencial, e não é possível listar reservas.
- O código vai no fragmento da URL (`#/r/...`), que não é enviado ao servidor de hospedagem nem a sites
  externos.
- A disponibilidade pública mostra só "ocupado/livre". Nomes, telefones e anotações de bloqueio nunca
  aparecem no documento do dia.
- Coletamos apenas nome e telefone. O aviso de privacidade é configurável em Ajustes.

## 10. Abuso

Controles existentes:

- validação completa no servidor (formato, serviço real, preço real, horário dentro do expediente,
  antecedência, janela, pausa);
- campo invisível contra robôs simples e limite de 3 reservas a cada 10 minutos por sessão do navegador;
- Firebase App Check (opcional, ver [INSTALACAO.md](INSTALACAO.md)) dificulta chamadas fora do site;
- modo com aprovação, para quem preferir conferir cada pedido.

**Limitação honesta:** sem um servidor próprio não é possível limitar reservas por IP ou por telefone de
forma confiável. Alguém determinado pode ocupar horários com reservas falsas (a profissional cancela
pelo painel). A alternativa mais econômica está em [CUSTOS.md](CUSTOS.md) (Cloud Functions no plano
Blaze). CAPTCHA e App Check **não** substituem as regras de autorização — são uma camada a mais.

## 11. Cópia de segurança (exportação manual)

Em Ajustes → Exportar e importar dados. **Não é backup automático.**

Formato (`agenda-base/backup`, versão 1), um arquivo JSON:

```json
{
  "format": "agenda-base/backup",
  "version": 1,
  "exportedAt": "2026-11-16T12:00:00.000Z",
  "settings": { "business": {}, "rules": {}, "week": {}, "exceptions": {}, "timezone": "America/Manaus" },
  "services": [{ "id": "mao", "name": "Mão", "price": 3500, "duration": 45, "buffer": 10, "active": true, "order": 1 }],
  "blocks": [{ "id": "…", "day": 20261120, "s": 600, "e": 660, "allDay": false, "note": "" }],
  "bookings": [{ "token": "…43 caracteres…", "bid": "…20…", "status": "confirmed", "day": 20261117,
                 "start": 120, "n": 11, "startAt": "2026-11-17T14:00:00.000Z",
                 "service": { "id": "mao", "name": "Mão", "price": 3500, "duration": 45, "buffer": 10 },
                 "customer": { "name": "…", "phone": "92…" }, "…": "…" }]
}
```

Preços em centavos; `day` é AAAAMMDD; `start`/`n` são átomos de 5 minutos; datas em ISO 8601 (UTC).

**Importação** (restauração segura):

- **não apaga nada**; reservas cujo código já existe são puladas — importar duas vezes não duplica;
- reservas futuras pendentes/confirmadas voltam a ocupar a agenda **passando pela mesma regra de
  sobreposição**; se o horário já estiver ocupado, a reserva **não entra** e aparece no relatório de
  conflitos para a profissional resolver;
- reservas passadas e encerradas entram como histórico, sem ocupar agenda; solicitações vencidas entram
  como expiradas;
- os links das clientes continuam funcionando (o código é preservado);
- a configuração só é substituída se a opção for marcada.

Limites: o arquivo contém nomes e telefones (guarde com cuidado); a lista de clientes no painel considera
as 500 reservas mais recentes; logos grandes aumentam o arquivo.
