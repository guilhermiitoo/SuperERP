# Custos, cotas e limitações

**Resumo:** no volume de um negócio de uma profissional, esta versão roda **dentro da cota sem custo**
do plano Spark do Firebase, sem cartão cadastrado e sem domínio próprio. Isso **não é uma promessa de
custo zero para sempre**: as cotas e preços são do Google e podem mudar. Confira a página oficial de
preços antes de cada nova instalação.

Valores consultados em novembro de 2026 (fontes no fim). Itens marcados com **(não confirmado)** não
foram confirmados na página oficial durante a pesquisa.

## O que é usado e onde cabe

| Serviço | Uso nesta versão | Cota sem custo (Spark) | Precisa de faturamento? |
|---|---|---|---|
| Cloud Firestore | Configuração, serviços, dias, reservas | 50 mil leituras/dia, 20 mil gravações/dia, 20 mil exclusões/dia, 1 GiB armazenado, 10 GiB/mês de saída | Não |
| Authentication (e-mail/senha) | Só a conta da proprietária | Gratuito no volume de uma pessoa (a referência pública fala em 50 mil usuários ativos/mês) | Não |
| Hosting | O site (≈ 600 KB) | 10 GB de armazenamento; transferência de cerca de 10 GB/mês (**limite diário não confirmado**) | Não |
| App Check + reCAPTCHA v3 | Opcional | Cota gratuita do reCAPTCHA **(não confirmado)** | Não, no volume esperado |
| Domínio próprio | Opcional | `….web.app` é gratuito | Só o registro do domínio |
| WhatsApp | Manual (botões `wa.me`) | Sem custo | Não |

## Estimativa de uso (piloto da manicure)

Contas aproximadas, considerando também as leituras feitas pelas regras de segurança (`get()` nas
regras conta como leitura):

| Ação | Leituras | Gravações |
|---|---|---|
| Cliente abre o link e vê os horários (14 dias) | ~25 | 0 |
| Cliente confirma uma reserva | ~10 | 3 |
| Cliente abre o link da reserva | 1 | 0 |
| Profissional abre o painel (inclui manutenção dos dias) | ~80 | 0–5 |
| Tela "Hoje" aberta (atualiza a cada 90 s) | ~15 por atualização | 0 |

Com 20 reservas/dia, 100 visitas ao link e o painel aberto 8 horas: **≈ 10 mil leituras e < 100
gravações por dia** — cerca de 20% da cota de leitura. A maior parte vem da atualização automática do
painel; fechar a tela "Hoje" quando não estiver usando reduz o consumo.

## O que acontece se a cota acabar

No plano Spark, ao estourar uma cota diária o serviço **para de responder até o dia seguinte** (não há
cobrança). Para a cliente, o link mostra "Não foi possível carregar os horários" — **nenhuma reserva é
confirmada sem gravar no servidor**, então não há horário duplicado, só indisponibilidade temporária.

## O que exige faturamento (plano Blaze)

O Blaze é "pague pelo uso" e mantém as mesmas cotas sem custo; só cobra o que passar delas. Exige cartão.

| Recurso | Para quê | Situação nesta versão |
|---|---|---|
| Cloud Functions | Envio automático de WhatsApp, lembretes, limite por IP/telefone, expiração no horário exato | **Não usado** |
| Backups agendados do Firestore / recuperação para um ponto no tempo | Backup automático | **Não usado** — há exportação **manual** no painel |
| Cloud Storage | Fotos, logo grande | **Não usado** — o logo é guardado reduzido (192 px) na configuração |

Se migrar para o Blaze, **configure um alerta de orçamento** (Console Google Cloud → Faturamento →
Orçamentos e alertas). O alerta avisa, mas não bloqueia gastos.

## Limitações operacionais (sem servidor próprio)

1. **Abuso:** não dá para limitar reservas por IP ou telefone de forma confiável. Alternativa mais
   econômica: uma Cloud Function de criação de reservas com limite por telefone (Blaze; no volume do
   piloto tende a ficar dentro da cota gratuita das Functions).
2. **Expiração de pendências** é calculada na leitura e gravada quando o painel abre — o horário é
   liberado no instante certo para a disponibilidade, mas o registro "Expirado" aparece no banco só
   depois.
3. **Dias publicados** até "dias à frente + 30": se o painel passar mais de 30 dias fechado, os dias mais
   distantes somem do link até a próxima abertura.
4. **Sem avisos automáticos**: a profissional sabe de novas reservas abrindo o painel (ele se atualiza a
   cada 90 s enquanto aberto). Notificações push exigiriam servidor.
5. **Backup é manual**: depende de alguém exportar de tempos em tempos.
6. **Horário de verão** não é suportado pela conferência no servidor (ver [REGRAS.md](REGRAS.md)).

## Se o uso crescer

- Até algumas centenas de reservas por dia: continua no Spark; reduza a frequência de atualização do
  painel se as leituras chegarem perto do limite.
- Mais profissionais no mesmo negócio: o modelo de dados já separa a agenda (`agendas/main`); seria
  preciso expor o seletor e uma agenda por profissional (desenvolvimento, não custo).
- Lembretes automáticos ou anti-abuso forte: Blaze + Cloud Functions (ver [WHATSAPP.md](WHATSAPP.md)).

## Uso comercial

O Firebase é oferecido sob os Termos de Serviço do Google Cloud/Firebase, que permitem uso comercial;
**não foi encontrada na pesquisa** uma restrição específica do plano Spark para uso comercial, mas os
termos não foram revisados juridicamente. Como cada negócio terá a **própria conta** Google/Firebase,
quem vende a instalação deve deixar claro em contrato quem é o titular da conta e quem responde pelos
dados das clientes (LGPD).

## Fontes

- [Preços do Firebase](https://firebase.google.com/pricing)
- [Firestore: uso e limites](https://firebase.google.com/docs/firestore/quotas)
- [Firestore: backup e restauração (exige Blaze)](https://firebase.google.com/docs/firestore/backups)
- [Notas de versão do Firebase](https://firebase.google.com/support/releases)
- [Regras do Firestore: condições e limites de get()/exists()](https://firebase.google.com/docs/firestore/security/rules-conditions)
