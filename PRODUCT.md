# Product

<!-- impeccable:product-schema 1 -->

> Registro escrito a partir do briefing do proprietário do projeto (novembro/2026), sem rodada de entrevista:
> o briefing pediu execução autônoma. Itens marcados com **(inferido)** não foram confirmados em conversa
> e devem ser revistos pelo proprietário.

## Platform

web

## Stack

delegated: HTML, CSS e JavaScript em módulos ES, sem etapa de build obrigatória para publicar.
Firebase Authentication + Cloud Firestore como camada confiável (sem Cloud Functions, para caber no plano
gratuito) e hospedagem estática. O briefing autorizou "HTML/CSS/JavaScript ou TypeScript" e pediu framework
"apenas se melhorar claramente a manutenção"; a escolha final está justificada em `docs/PLANO.md`.

## Users

- **Cliente do salão**: pessoa que recebe um link (WhatsApp, Instagram) e quer reservar um horário pelo
  celular, em pé, com pressa, sem criar conta e sem pedir ajuda.
- **Profissional autônoma** (primeiro caso: manicure que atende sozinha): administra o negócio inteiro pelo
  celular, entre um atendimento e outro, com pouca familiaridade com tecnologia. Precisa responder em segundos
  "quem eu atendo hoje?", "qual é o próximo?" e "o que precisa da minha aprovação?".
- **Instalador/revendedor** (o proprietário do projeto): instala a mesma base para outro negócio trocando
  configuração, sem reescrever o sistema.

## Product Purpose

Sistema de agendamento por link para negócios de uma profissional: manicure, barbearia, cabeleireiro,
sobrancelhas e estética. A cliente escolhe serviço, data e horário realmente disponíveis; a profissional
organiza a agenda. Sucesso significa: a cliente reserva sozinha, a profissional administra o dia pelo celular
e a agenda continua correta sob concorrência e falhas.

## Positioning

Uma instalação independente por negócio (dados e contas de infraestrutura separados), vendida uma única vez,
operando dentro de cotas gratuitas no volume inicial. A proteção contra horários sobrepostos é garantida no
banco de dados, não na tela.

## Operating Context

- O link de agendamento circula por WhatsApp e redes sociais; costuma abrir em navegadores embutidos de aplicativos.
- A profissional usa o painel no celular, com uma mão, frequentemente com a outra ocupada.
- A comunicação com clientes acontece pelo WhatsApp comum; nesta versão as mensagens são abertas com texto
  pronto e enviadas manualmente.
- Fuso inicial: America/Manaus. Idioma: português do Brasil. Moeda: real.

## Capabilities and Constraints

- Reserva pública sem conta; link individual para a cliente gerenciar a própria reserva.
- Painel: Hoje, Agenda (dia/semana), Clientes, Ajustes; serviços, horários, pausas, folgas, bloqueios.
- Confirmação automática ou mediante aprovação, com expiração de solicitações.
- Uma profissional na primeira versão; modelo de dados preparado para mais de uma, sem expor seletor.
- Fora do escopo inicial: marketplace, assinatura, sinal/pagamento, financeiro, estoque, fidelidade, chatbot,
  gestão central de vários negócios, WhatsApp automático.
- Não usar automação não oficial do WhatsApp; não apresentar mensagem simulada como enviada.
- Nome do produto é provisório e substituível: **Agenda Base** **(inferido)**.

## Brand Commitments

Definidos no briefing para a demonstração da manicure:

- Identidade elegante, acolhedora e contemporânea.
- Fundo claro, tons neutros quentes e uma cor de destaque refinada.
- Ícones consistentes; sem emojis como base da interface.
- Evitar excesso de gradientes, efeito de vidro, sombras fortes e decoração sem função.
- Tema adaptável a outros segmentos (cor principal e identidade configuráveis por instalação).
- Animações discretas, respeitando preferência por movimento reduzido.

## Evidence on Hand

- Não há marca, logotipo, fotos, depoimentos ou clientes reais. Nada disso deve ser inventado como verdadeiro.
- O negócio de demonstração ("Studio Aurora", endereço e telefone) e todas as clientes de exemplo são
  fictícios e precisam aparecer identificados como demonstração.

## Product Principles

1. A agenda correta vale mais do que qualquer recurso: nunca confirmar o que o servidor não gravou.
2. Poucos passos, texto curto, alvo de toque grande: a cliente não deve precisar de ajuda.
3. Nenhum dado de uma cliente aparece para outra; nenhum termo técnico aparece para a cliente.
4. Enxuto e bem acabado antes de amplo e incompleto.
5. Tudo que varia por negócio é configuração, não código.

## Accessibility & Inclusion

Público com pouca familiaridade com tecnologia e uso predominante no celular. O briefing exige contraste
adequado, foco visível, navegação por teclado, rótulos nos campos, mensagens de erro claras e respeito a
`prefers-reduced-motion`. Meta adotada: WCAG 2.2 nível AA **(inferido)**.
