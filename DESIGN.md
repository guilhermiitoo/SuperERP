---
name: Agenda Base
description: Agendamento por link para negócios de uma profissional, com cara de folhinha de parede.
colors:
  accent: "#8b2f4b"
  on-accent: "#ffffff"
  paper: "oklch(97.6% 0.006 15)"
  surface: "oklch(99.6% 0.002 15)"
  sunken: "oklch(95.2% 0.009 15)"
  ink: "oklch(24% 0.022 12)"
  ink-2: "oklch(42% 0.022 12)"
  ink-3: "oklch(51% 0.02 12)"
  line: "oklch(90% 0.012 15)"
  line-strong: "oklch(78% 0.02 15)"
  ok: "oklch(43% 0.1 155)"
  ok-soft: "oklch(95.5% 0.035 155)"
  warn: "oklch(45% 0.1 65)"
  warn-soft: "oklch(95.5% 0.045 85)"
  danger: "oklch(47% 0.16 27)"
  danger-soft: "oklch(96% 0.025 27)"
typography:
  numeral-display:
    fontFamily: "Sofia Sans Condensed, Sofia Sans, system-ui, sans-serif"
    fontSize: "2.6rem"
    fontWeight: 800
    lineHeight: 0.95
    fontFeature: "tnum, lnum"
  business-name:
    fontFamily: "Sofia Sans Condensed, Sofia Sans, system-ui, sans-serif"
    fontSize: "clamp(1.9rem, 7.6vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 0.98
  headline:
    fontFamily: "Sofia Sans, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Sofia Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Sofia Sans, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Sofia Sans, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 650
    lineHeight: 1.3
  leaf-band:
    fontFamily: "Sofia Sans, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 750
    letterSpacing: "0.07em"
rounded:
  sm: "4px"
  md: "7px"
  lg: "12px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  tap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "48px"
  button-confirm:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    height: "48px"
  slot:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.numeral-display}"
    rounded: "{rounded.md}"
    height: "52px"
  slot-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "52px"
  chip-pending:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "999px"
  chip-confirmed:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
    rounded: "999px"
---

# Design System: Agenda Base

> Registrado a partir do código construído (novembro/2026). A linguagem descritiva (nome da estrela-guia,
> nomes de cores) vem do contrato de direção e **não passou por entrevista** com o proprietário — revise.

## Overview

**Creative North Star: "A Folhinha de Parede"**

A agenda é lida como a folhinha de mercearia pendurada na parede do salão: a data é uma folha com faixa
escura no topo, número grande e o mês embaixo; o nome do negócio ocupa a faixa colorida do topo, como o
anunciante da folhinha. Tudo o mais é uma ferramenta de trabalho limpa, legível de longe e operável
com uma mão.

A densidade é confortável, não espremida: alvos de toque de pelo menos 48 px, texto de corpo de 17 px,
uma informação principal por linha. Profundidade vem de linhas finas e de variação de tom do papel, nunca
de sombras. A cor de marca é uma só e muda por instalação; o restante é neutro quente puxado para o
matiz dela.

**Key Characteristics:**
- Datas como folhas de calendário (faixa + número condensado + mês) — o elemento assinatura.
- Horas e preços em numerais condensados, pesados e tabulares.
- Papel levemente rosado, tinta quase preta, um único destaque (bordô de esmalte na demonstração).
- Verde e âmbar só como estado (confirmado, aguardando), nunca decoração.
- Plano: linhas de 1 px e tons de papel; sombra só no painel deslizante.

## Colors

Neutros quentes derivados do matiz 12–15 (rosado) e um único destaque configurável.

### Primary
- **Bordô de Esmalte** (#8b2f4b): faixa do negócio, botão principal, horário selecionado, folha
  selecionada, aba ativa. Configurável por instalação; `js/core/theme.js` escurece a cor escolhida até o
  texto sobre ela e ela como texto atingirem 4,5:1.

### Neutral
- **Papel** (oklch(97.6% 0.006 15)): fundo da página.
- **Folha** (oklch(99.6% 0.002 15)): superfícies de listas, campos, cartões.
- **Papel Afundado** (oklch(95.2% 0.009 15)): dias indisponíveis, botões desativados, bloqueios.
- **Tinta** (oklch(24% 0.022 12)): texto principal e a faixa da folha de calendário.
- **Tinta 2 / Tinta 3** (oklch(42%…) / oklch(51%…)): texto secundário; Tinta 3 só para ícones e
  texto grande.
- **Linha / Linha Forte** (oklch(90%…) / oklch(78%…)): divisórias entre linhas; contorno de botões e campos.

### Estados
- **Confirmado** (oklch(43% 0.1 155) sobre oklch(95.5% 0.035 155)).
- **Aguardando** (oklch(45% 0.1 65) sobre oklch(95.5% 0.045 85)) — pendências de aprovação.
- **Perigo** (oklch(47% 0.16 27) sobre oklch(96% 0.025 27)) — cancelar, erros, sem conexão grave.

### Named Rules
**The One Ink Rule.** Só existe uma cor de marca por instalação. Nenhuma tela introduz um segundo
destaque decorativo.

**The State-Only Rule.** Verde, âmbar e vermelho aparecem apenas quando carregam significado (estado,
erro, aviso). Nunca como enfeite.

## Typography

**Display/Numeral Font:** Sofia Sans Condensed (fallback Sofia Sans, system-ui)
**Body Font:** Sofia Sans (fallback system-ui)

**Character:** grotesca humanista para ler com conforto; a versão condensada e pesada só para números e
para o nome do negócio, como a tipografia impressa de uma folhinha. Fontes servidas do próprio site
(`public/vendor/fonts`, SIL OFL).

### Hierarchy
- **Numeral display** (800, 2.6rem tela Hoje / 2.05rem folha / 1.35rem horário, lh ≈ 1): horas, dias,
  preços. Sempre `tabular-nums lining-nums`.
- **Business name** (800, clamp(1.9rem, 7.6vw, 2.5rem), maiúsculas): só na faixa do topo.
- **Headline** (700, 1.625rem, lh 1.15): título da tela (`h1`).
- **Title** (700, 1.125rem): nome do serviço, nome da cliente na lista.
- **Body** (400, 1.0625rem, lh 1.45): texto corrido; avisos em 0.9375rem.
- **Label** (650, 0.9375rem): rótulos de campo, "Passo 2 de 3".
- **Leaf band** (750, 0.72rem, +0.07em, maiúsculas): faixa da folha e grupos "MANHÃ / TARDE". Única
  ocorrência de texto pequeno em maiúsculas espaçadas.

### Named Rules
**The Numbers Speak Condensed Rule.** Toda hora, data e preço usa o numeral condensado tabular; texto
nunca usa a condensada.

## Layout

Coluna única centrada (`--page`: 35rem no celular; 41rem a partir de 48rem na área pública). Margem
lateral de 16 px. Ritmo de espaçamento em 4/8/12/16/24/32/48 px, com mais espaço acima dos títulos do que
abaixo. No painel, até 60rem a navegação é uma barra fixa inferior de 4 abas; a partir de 60rem vira
coluna lateral de 13rem e o conteúdo ocupa até 48rem. A faixa de dias rola na horizontal no celular e
quebra em grade a partir de 48rem. Nada provoca rolagem lateral da página.

## Elevation & Depth

Sistema plano. Profundidade vem de tom (Papel → Folha → Papel Afundado) e de linhas de 1 px. A única
sombra é a do painel deslizante (diálogo), que precisa se separar do conteúdo escurecido atrás.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 -0.6rem 2.5rem -0.6rem oklch(24% 0.022 12 / 0.28)`): folha deslizante no
  celular; no desktop `0 1.2rem 3rem -1rem oklch(24% 0.022 12 / 0.35)`.

### Named Rules
**The Flat Paper Rule.** Cartões, listas e botões não têm sombra. Separação = linha ou tom.

## Shapes

Cantos discretos: 4 px (foco, chips pequenos), 7 px (botões, campos, folhas, horários), 12 px (listas e
cartões), pílula só para chips de estado. A folha de calendário é um retângulo com faixa superior
sólida — a silhueta que identifica o produto. Listas são blocos únicos com divisórias internas, não
cartões soltos.

## Components

### Buttons
- **Shape:** 7 px; altura mínima 48 px (40 px na variante pequena).
- **Primary:** Bordô sobre texto branco (ou tinta, se a cor da instalação for clara).
- **Secondary:** Folha com contorno Linha Forte; contorno escurece no hover; desce 1 px ao tocar.
- **Confirm (Aprovar/Concluído):** verde de estado com ícone de check.
- **Danger:** texto vermelho com contorno vermelho claro.
- **Quiet:** texto na cor de marca, sem contorno — "Trocar", "Voltar", "Ver a semana".
- **Busy:** o rótulo some e aparece um giro; o botão fica bloqueado (impede envio duplo).

### Folha de calendário (signature)
- Faixa superior Tinta com o dia da semana; número condensado 800; mês embaixo.
- Selecionada: contorno e faixa na cor de marca, número na cor de marca.
- Indisponível: Papel Afundado, faixa Linha, rodapé "lotado" ou "fechado".
- No painel, o rodapé vira pontinhos (um por atendimento, até cinco).
- Ao trocar de dia, os horários entram com uma "folha virada" (rotateX curto); desligado em
  `prefers-reduced-motion`.

### Horário (slot)
- Botão de 52 px com a hora em numeral condensado 1.35rem; grade auto-fill de no mínimo 5.1rem.
- Selecionado: fundo da cor de marca.

### Lista de preços / atendimentos
- Bloco único Folha, cantos 12 px, linhas separadas por Linha; linha inteira tocável, seta à direita.
- Preço: "R$" pequeno + valor condensado 1.5rem. Atendimento: hora condensada à esquerda.

### Chips
- Pílula com ponto colorido + texto 0.8125rem 700; cor = estado.

### Inputs / Fields
- 52 px, contorno Linha Forte, cantos 7 px; foco: contorno da cor de marca + halo de 3 px a 25%.
- Erro: contorno vermelho, mensagem com ícone embaixo, ligada por `aria-describedby`.

### Navigation
- Celular: barra inferior fixa, 4 abas (Hoje, Agenda, Clientes, Ajustes) com ícone + rótulo; ativa em
  cor de marca com traço superior de 3 px; selo âmbar com o número de pendências.
- Desktop: coluna lateral; ativa com fundo suave da cor de marca e traço lateral.

### Folha deslizante (diálogo)
- `<dialog>` nativo; sobe de baixo no celular, centralizado no desktop; Esc fecha; foco preso.

## Do's and Don'ts

### Do:
- **Do** representar toda data com a folha de calendário e toda hora/preço com o numeral condensado.
- **Do** manter alvos de toque ≥ 48 px e texto de corpo ≥ 17 px.
- **Do** derivar a cor de cada instalação via `themeFrom()` para garantir 4,5:1.
- **Do** dizer o estado em palavras ("Ainda não está confirmado") além da cor.
- **Do** usar os ícones de traço próprios (`js/ui/icons.js`, traço 1.75, grade 24).

### Don't:
- **Don't** usar emoji como ícone ou decoração da interface (pedido do briefing).
- **Don't** usar gradientes, vidro/blur decorativo ou sombras fortes (pedido do briefing).
- **Don't** introduzir uma segunda cor de marca ou usar as cores de estado como enfeite.
- **Don't** colocar rótulo pequeno em maiúsculas acima de títulos; o texto em maiúsculas espaçadas fica
  restrito à faixa da folha e aos grupos de horário.
- **Don't** usar a fonte condensada para texto corrido.
