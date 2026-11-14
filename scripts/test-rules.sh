#!/bin/sh
# Roda os testes que dependem do emulador e garante que nenhum emulador antigo fique ocupando a porta.
# Uma cópia completa do resultado fica em test-results/ (útil para investigar falhas intermitentes).
pkill -f cloud-firestore-emulator 2>/dev/null
sleep 1
mkdir -p test-results
OUT="test-results/emulador-$(date -u +%Y%m%dT%H%M%S).tap"
exec npx firebase emulators:exec --only firestore,auth --project demo-agenda \
  "node --test --test-concurrency=1 --test-reporter=tap --test-reporter-destination=stdout --test-reporter=tap --test-reporter-destination=$OUT $*"
