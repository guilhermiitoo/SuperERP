# Entrega para a profissional (fazer uma vez e entregar)

Objetivo: tudo no nome de uma conta **do negócio**, gratuita, sem cartão e sem nada ligado a você.
No fim, você entrega à profissional a senha do e-mail do negócio e o endereço do painel.

Volume esperado: até ~20 clientes por mês. Tudo abaixo cabe com muita folga nos planos gratuitos.

## 1. E-mail do negócio

1. Crie um Gmail novo, por exemplo `studio.nomedonegocio@gmail.com`.
2. **Use esse mesmo e-mail em tudo**: Firebase, EmailJS e como login do painel.
3. Cadastre como recuperação o **celular da profissional** (não o seu).

## 2. Firebase (o banco e o site) — gratuito, sem cartão

Siga [INSTALACAO.md](INSTALACAO.md), passos 2 a 6, **logado com o e-mail do negócio**.
Resumo do que sai dali:

- o site publicado em `https://SEU-PROJETO.web.app` (link das clientes);
- o painel em `https://SEU-PROJETO.web.app/painel.html`;
- o login do painel: o e-mail do negócio + uma senha provisória.

Não ative o plano Blaze nem cadastre cartão. Nada aqui precisa disso.

## 3. Aviso por e-mail a cada reserva (EmailJS) — gratuito

Ela recebe um e-mail quando alguém **reserva, remarca ou cancela** pelo link, com nome, telefone,
serviço, dia e hora, e um link que abre a conversa no WhatsApp da cliente.

1. Entre em <https://www.emailjs.com> e crie a conta com o **e-mail do negócio** (plano Free).
2. **Email Services → Add New Service → Gmail** → conecte o Gmail do negócio. Anote o **Service ID**.
3. **Email Templates → Create New Template**:
   - **Subject:** `{{assunto}}`
   - **To Email:** o e-mail onde ela quer receber (pode ser o próprio Gmail do negócio)
   - **Content** (cole):

     ```
     {{assunto}}

     Situação: {{situacao}}
     Cliente: {{cliente}}
     Telefone: {{telefone}}
     Serviço: {{servico}}
     Quando: {{quando}}

     Falar com a cliente no WhatsApp: {{whatsapp}}
     Abrir o painel: {{painel}}
     ```

   Salve e anote o **Template ID**.
4. **Account → General**: anote a **Public Key**.
5. Ainda em **Account → Security**, em "Allowed origins"/domínios permitidos (se a opção existir na
   sua conta), coloque só o endereço do site (`https://SEU-PROJETO.web.app`).
6. No computador, edite `public/config.js`:

   ```js
   avisoEmail: {
     serviceId: 'service_xxxxxxx',
     templateId: 'template_xxxxxxx',
     publicKey: 'xxxxxxxxxxxxxxx',
   },
   ```

7. Publique de novo (`npm run deploy`) e faça uma reserva de teste pelo link: o e-mail deve chegar em
   menos de um minuto. Se não chegar, confira a pasta de spam e o histórico em EmailJS → History.

**Limites do plano gratuito:** 200 e-mails por mês. Ao chegar no limite ele **para de enviar, não
cobra**. A reserva continua valendo e aparece no painel normalmente, só sem o e-mail.

**Importante:** o e-mail é enviado pelo celular da cliente logo depois da reserva gravada. Se a internet
dela cair naquele segundo, o e-mail pode não sair. **O painel é sempre a fonte certa.**

Esses três códigos (Service ID, Template ID, Public Key) ficam visíveis no site, como os do Firebase.
Isso é esperado no EmailJS: com eles só é possível enviar e-mails **para o endereço fixo do modelo**,
ou seja, para ela mesma.

## 4. WhatsApp Business: mensagem automática com o link

No celular dela, no **WhatsApp Business**:

1. **Ferramentas comerciais → Mensagem de saudação** → ativar.
2. Texto sugerido:

   ```
   Oi! Que bom falar com você 💅
   Para marcar seu horário, é só escolher aqui: https://SEU-PROJETO.web.app
   Você recebe a confirmação na hora.
   ```

3. Opcional: **Ferramentas comerciais → Perfil comercial → Site** com o mesmo link, e o link na bio do
   Instagram.

Lembretes e confirmações para as clientes: no painel, os botões **Lembrete** e **WhatsApp** abrem a
conversa com o texto pronto. Ela só toca em enviar.

## 5. Entrega

1. No celular dela, abra o painel e use **Adicionar à tela de início** (vira um aplicativo).
2. Ela troca a senha do painel em **"Esqueci minha senha"** e a senha do Gmail do negócio.
3. Faça com ela uma reserva de teste pelo link, veja chegar no painel e no e-mail, e cancele.
4. Mostre: **Hoje**, **Nova reserva**, **Bloquear**, **Concluído / Não veio**, **Lembrete**, e
   **Ajustes → Receber agendamentos pelo link** (pausa para férias).
5. Mostre **Ajustes → Exportar e importar dados** e peça para ela exportar de vez em quando
   (é a cópia de segurança dela).
6. Entregue a ela: a senha do Gmail do negócio, o link das clientes, o link do painel.

Depois disso você não precisa de acesso a nada. Tudo — Firebase, EmailJS, painel — é recuperável pelo
Gmail do negócio, que tem o celular dela como recuperação.
