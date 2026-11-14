# WhatsApp

## Como funciona hoje (manual, sem custo)

O sistema **não envia mensagens sozinho**. Os botões de WhatsApp abrem a conversa com o texto já
escrito (`https://wa.me/55DDDNUMERO?text=…`). A mensagem só sai quando a pessoa **toca em enviar** — a
tela diz isso ao lado de cada botão. A reserva é gravada antes e independentemente do envio.

| Onde | Quem envia | Mensagem pronta |
|---|---|---|
| Confirmação da cliente | Cliente → negócio | "Sou Maria e acabei de agendar Mão para terça-feira, 17 de novembro, às 14:00." |
| Solicitação pendente | Cliente → negócio | "…enviei uma solicitação… Pode confirmar para mim?" |
| Remarcação / cancelamento pela cliente | Cliente → negócio | "…remarquei…" / "…cancelei…" |
| Aprovação no painel | Negócio → cliente | "Seu horário no Studio … está confirmado: … Para ver, remarcar ou cancelar: <link>" |
| Lembrete (tela Hoje / ficha) | Negócio → cliente | "Passando para lembrar do seu horário…" + link |
| Remarcação / cancelamento / recusa no painel | Negócio → cliente | Texto correspondente |

Os textos ficam em `public/js/core/whatsapp.js` e têm testes em `tests/unit/extras.test.mjs`.

Não usamos automação do WhatsApp Web nem qualquer ferramenta não oficial: elas violam os termos do
WhatsApp e podem bloquear o número do negócio.

## Aviso por e-mail para a profissional (gratuito)

Cada reserva, remarcação ou cancelamento feito pelo link pode enviar um e-mail para a profissional pelo
EmailJS (plano grátis). Configuração em [ENTREGA.md](ENTREGA.md). Desligado enquanto `avisoEmail` em
`public/config.js` estiver vazio.

## Ponto de integração

`public/js/core/notify.js` é o único lugar que as telas chamam quando algo acontece
(`booking_created`, `booking_pending`, `booking_rescheduled`, `booking_cancelled`…). Hoje ele devolve
`{ status: 'disabled' }` e nenhuma tela diz que algo foi enviado. Ligar a automação no futuro não exige
mexer nas telas.

## Como adicionar envio automático (futuro)

Requer plano **Blaze** (Cloud Functions) e a **API oficial do WhatsApp Business (Cloud API)**, que cobra
por conversa/mensagem conforme a tabela da Meta. Passos:

1. **Conta e número:** criar uma conta no Meta Business, verificar a empresa e registrar um número
   **exclusivo** para a API (um número na API deixa de funcionar no aplicativo comum do WhatsApp).
2. **Credenciais só no servidor:** o token de acesso da Meta fica em **Secret Manager** e é lido apenas
   pela Cloud Function. Nunca em `config.js`, no repositório ou no navegador.
3. **Modelos aprovados:** mensagens iniciadas pela empresa (confirmação, lembrete) precisam de
   **modelos** aprovados pela Meta, em português, com variáveis (nome, serviço, data, link).
4. **Autorização da cliente (opt-in):** acrescentar ao formulário uma caixa "Quero receber confirmação
   e lembrete pelo WhatsApp", gravar o consentimento e a data na reserva, e só enviar com consentimento.
   Atualizar o aviso de privacidade.
5. **Disparo:** uma Cloud Function acionada pela criação/alteração de `bookings/{token}` (gatilho do
   Firestore) envia a confirmação. Funciona com o painel fechado.
6. **Lembretes:** uma Cloud Function agendada (ex.: a cada 15 min) procura reservas confirmadas que
   começam nas próximas 24 h/2 h e ainda não receberam lembrete.
7. **Sem duplicidade:** registrar cada envio em `messages/{bookingId}_{tipo}_{rev}` com `create()` (falha
   se já existir) antes de chamar a API; reprocessamentos não enviam duas vezes.
8. **Lembretes obsoletos:** antes de enviar, reler a reserva e conferir `status`, `rev` e `startAt`; se
   foi cancelada ou remarcada, não envia (a revisão `rev` muda a cada alteração).
9. **Acompanhamento:** gravar o resultado (`queued`, `sent`, `delivered`, `failed` + motivo) recebido
   pelo webhook de status da Meta e mostrar no painel. Falhas aparecem para a profissional, que pode
   usar o botão manual.
10. **Ligar no aplicativo:** trocar `notify.js` para chamar um endpoint HTTPS da própria Function e
    devolver o status real. A tela só diz "enviado" quando o status for `sent`.

Estimativa de esforço: 2–4 dias de desenvolvimento + aprovação de modelos pela Meta (prazo variável).
