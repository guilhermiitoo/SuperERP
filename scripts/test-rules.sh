#!/bin/sh
# Roda os testes que dependem do emulador e garante que nenhum emulador antigo fique ocupando a porta.
pkill -f cloud-firestore-emulator 2>/dev/null
sleep 1
exec npx firebase emulators:exec --only firestore,auth --project demo-agenda "node --test --test-concurrency=1 $*"
