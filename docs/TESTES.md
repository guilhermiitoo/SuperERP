# Verificações

Resultados reais das execuções em 14/11/2026, neste repositório. Para repetir:

```bash
npm test
```

| Suíte | Comando | Onde roda | Testes | Resultado |
|---|---|---|---|---|
| Unidade (regras de negócio) | `npm run test:unit` | Node | 100 | 100 passaram |
| Regras de segurança e fluxos de dados | `npm run test:rules` | Emulador Firestore + Auth, regras ligadas | 50 | 50 passaram |
| Interface (demonstração) | `npm run test:e2e` | Chromium (Playwright), celular 390 px e desktop 1280 px | 38 | 38 passaram |
| Aplicativo real contra o emulador | `npm run test:e2e:firebase` | Chromium + SDK empacotado + emulador | 8 | 8 passaram |

A suíte do emulador precisa de Java 11+. Cada execução dela grava o resultado completo em
`test-results/emulador-*.tap`.

## As 15 verificações pedidas

| # | Verificação | Onde é testada | Como |
|---|---|---|---|
| 1 | Duas reservas simultâneas para o mesmo período: só uma é aceita | `tests/rules/fluxos.test.mjs` ("duas reservas simultâneas…", "…inícios e durações diferentes…"); `tests/e2e-firebase` ("dois navegadores…") | 5 clientes disparando ao mesmo tempo no emulador: 1 aceita, 4 recebem `slot_taken`. Dois navegadores reais clicando juntos: um confirma, o outro vê o aviso e alternativas |
| 1b | O servidor impede sobreposição mesmo sem a tela | `tests/rules/ataques.test.mjs` (23 testes) | Gravações forjadas direto no banco: sem ocupar átomos, átomos a mais/a menos, a partir de leitura antiga, apagando átomos alheios, fora do expediente, preço adulterado, estados forjados — todas negadas |
| 2 | Serviços de durações diferentes | `schedule.test.mjs`, `fluxos.test.mjs` ("serviços de durações diferentes…") | 45 min ocupa 11 átomos, 90 min ocupa 20; não se cruzam |
| 3 | Almoço, bloqueio e fim do expediente | `schedule.test.mjs` (7 testes), `fluxos.test.mjs` ("almoço, bloqueio e fim do expediente…") | 11:30 cruzando o almoço, 14:30 cruzando bloqueio, 17:30 passando das 18:00 são recusados; 17:15 aceito com intervalo cortado |
| 4 | Reserva manual concorrendo com pública | `fluxos.test.mjs` ("reserva manual concorrendo…"); `painel.test.mjs` ("reserva manual usa a mesma disponibilidade…") | Proprietária e visitante ao mesmo tempo: uma aceita |
| 5 | Expiração de solicitação pendente | `booking.test.mjs`, `aprovacao.test.mjs` (4 testes), `store-demo.test.mjs` | Antes do prazo ninguém libera; depois qualquer visitante libera e reserva; aprovar depois do prazo é negado pelo servidor; prazo nunca passa de 1 h antes do início |
| 6 | Cancelamento libera disponibilidade | `fluxos.test.mjs`, `publico.test.mjs`, `painel.test.mjs` | Após cancelar, outra pessoa reserva o mesmo horário |
| 7 | Remarcação sem perder o horário original | `fluxos.test.mjs` ("remarcação é atômica…", "…concorrendo com reserva nova…"), `ataques.test.mjs` | Novo horário ocupado → nada muda; tentativa de ficar com os dois horários é negada |
| 8 | Dupla submissão | `publico.test.mjs` ("toque duplo…") | Três envios do formulário no mesmo instante gravam uma reserva |
| 9 | Cliente sem acesso à reserva de outra | `ataques.test.mjs` ("uma cliente não acessa…", "visitante não lista…", "o documento público do dia não contém dados pessoais"); `publico.test.mjs` | Código público (`bid`) não abre nada; listar reservas é negado; o dia público não tem nome/telefone/código |
| 10 | Visitante sem acesso administrativo | `ataques.test.mjs` ("conta autenticada que não é proprietária…"); `e2e-firebase` ("…conta que não é proprietária não entra"); `painel.test.mjs` | Conta criada por estranho não lê nem grava nada administrativo e não consegue se promover |
| 11 | Fuso horário | `time.test.mjs`, `schedule.test.mjs` | 23:30 de Manaus pertence ao dia local; antecedência calculada no fuso do negócio; testes de navegador rodam com fuso America/Manaus e o servidor confere instante × horário local |
| 12 | Mudança de preço sem alterar histórico | `booking.test.mjs`, `fluxos.test.mjs`, `painel.test.mjs` | Reserva antiga mantém R$ 35,00 e 45 min após o serviço passar a R$ 50,00 e 60 min |
| 13 | Falta de conexão sem falsa confirmação | `publico.test.mjs`, `pwa.test.mjs`, `e2e-firebase` ("sem conexão…") | Sem rede, a tela diz "ainda NÃO foi reservado", nada é gravado, dados digitados ficam; ao voltar, reserva uma vez |
| 14 | Exportação e recuperação | `backup.test.mjs`, `store-demo.test.mjs`, `painel.test.mjs` ("exportar… importar…") | Arquivo exportado restaura tudo em navegador limpo; importar de novo não duplica; conflito é relatado sem sobrescrever |
| 15 | Fluxo no celular e no desktop | `publico.test.mjs`, `painel.test.mjs`, `acessibilidade.test.mjs`, capturas em `tests/visual/capturas.mjs` | Fluxos completos em 390 px e 1280 px; sem rolagem horizontal; fluxo inteiro só com teclado |

## Acessibilidade

- `tests/e2e/acessibilidade.test.mjs`: axe-core com regras WCAG 2.0/2.1/2.2 A e AA em todas as telas
  do cliente e do painel, em 390 px e 1280 px — **0 violações**. A primeira execução encontrou nomes
  acessíveis diferentes do texto visível (WCAG 2.5.3) em botões de data, de atendimento e de serviço; foi
  corrigido.
- Testes adicionais: idioma `pt-BR`, todo controle com nome, alvos de toque ≥ 40 px na área principal,
  foco vai para o título a cada passo, `Esc` fecha diálogos, fluxo completo só com teclado.
- Contraste da cor configurável: `themeFrom()` testado com 7 cores (incluindo amarelo e branco) — texto
  sempre ≥ 4,5:1.

## Revisão visual

- Capturas de todas as telas em celular e desktop (`node tests/visual/capturas.mjs <pasta>`), revistas
  manualmente; correções feitas: layout do painel no desktop (navegação lateral), quebra de preço,
  barra de demonstração, regras de estilo da folha de calendário.
- Detector de padrões genéricos do impeccable: 1 aviso (listras decorativas no bloqueio) — corrigido.
- Revisão final por um revisor independente: ver "Revisão de design" abaixo.

## Falha intermitente investigada e corrigida

Em uma execução da suíte completa, 2 testes da suíte de regras falharam ("mudar o modo de confirmação só
afeta reservas novas" e "remarcação é atômica…"). Investigação:

- os testes marcavam horários "daqui a N horas" a partir do relógio real; rodando às 14:27 de Manaus,
  "daqui a 33 h" e "daqui a 57 h" caíam às **23:30**, e um atendimento de 45 min começando às 23:30
  atravessaria a meia-noite — o sistema recusou, **corretamente**;
- portanto o defeito era do **teste**, não do aplicativo. O gerador de horários dos testes
  (`tests/rules/_helpers.mjs`) passou a usar horários de calendário fixos (08:00–19:00) e a evitar o fim
  do dia nos casos relativos; um script conferiu os 36 valores usados em cada minuto de um dia inteiro:
  nenhum atravessa mais a meia-noite;
- depois da correção, a suíte passou em todas as execuções; cada execução agora guarda o log completo em
  `test-results/`.

As outras 2 falhas daquela mesma execução (interface do painel) vieram de um seletor de teste quebrado
pela correção de acessibilidade, e foram corrigidas.

## Revisão de design independente

Um revisor sem acesso ao processo de construção avaliou as 28 capturas (celular e desktop) contra o
pedido e a direção visual. Veredito: **fix**, com 7 correções materiais, todas aplicadas e cobertas por
teste quando possível:

1. "Próximo às 14:00" aparecia para quem já estava em atendimento → resumo "Em atendimento: … · Próxima
   às 16:30" e linha "Depois: …" no cartão;
2. linhas de horário estouravam a largura no celular → grade corrigida (teste mede o transbordo);
3. Sábado (um período) desalinhado → espaçador fixo;
4. campos de hora em AM/PM conforme o aparelho → listas sempre em 24 h;
5. reserva manual oferecia horários de hoje que já passaram sem aviso → grupo separado "Já passou (para
   registrar um atendimento)";
6. data da solicitação pendente pequena demais (parecia ser hoje) → data com o mesmo peso do horário;
7. nomes e textos truncados no celular → estado abaixo do nome, texto com quebra.

Também aplicadas as sugestões de "teto": folha de hoje maior e tela Hoje em duas colunas no desktop.
Não aplicado: um efeito visual de "folha destacável" na faixa de dias (o movimento de folha virada nos
horários existe; o restante foi considerado decorativo). O detector de padrões do impeccable não aponta
nada depois das correções.

## O que NÃO foi verificado (depende de configuração externa)

- Publicação em um projeto Firebase real (Hosting + regras + Auth): **não feito**. Tudo foi testado no
  emulador oficial, que roda o mesmo motor de regras.
- Entrega real do e-mail de redefinição de senha: no emulador o pedido é registrado e conferido; o
  envio real depende do projeto.
- App Check / reCAPTCHA: código pronto e desligado; não testado (precisa de chave real).
- Instalação do PWA em aparelhos reais (Android/iPhone): manifestos e service worker verificados no
  Chromium; a instalação em si não foi testada em aparelho.
- Navegadores embutidos (WhatsApp/Instagram) e Safari/iOS: não testados — só Chromium.
- Uso real com clientes: depende do piloto.
