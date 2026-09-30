# campaign-dispatcher

API NestJS que recebe uma campanha, grava os contatos e enfileira o disparo. Um worker BullMQ entrega cada par `campaignId` + `contactId` para um provider mock (WhatsApp ou Ads). O provider devolve o status depois, por webhook idempotente.

Não há frontend. Segredos ficam fora do git: use `.env` só na sua máquina e troque os valores do `docker-compose.yml` antes de expor o serviço.

## Subir a infra

```powershell
docker compose up -d postgres redis
Copy-Item .env.example .env
npm install
npx prisma migrate deploy
npm run start:dev
```

A API sobe na porta 3000. Postgres local usa a porta `54329` e Redis a `63799`, para não bater com instalações já existentes.

Para subir API, Postgres e Redis juntos:

```powershell
docker compose up --build
```

O container da API aplica as migrations ao iniciar.

## Teste do fluxo

Com Postgres e Redis no ar (`docker compose up -d postgres redis`):

```powershell
npm run test:flow
```

O teste cobre:

1. cadastro, login e JWT
2. `POST /campaigns` enfileirando WhatsApp, com telefone repetido virando um único disparo
3. o worker marcando cada contato como `SENT` uma única vez
4. reprocessar o mesmo par `campaignId` + `contactId` sem um segundo envio
5. `POST /webhooks/status` em `DELIVERED`, repetido sem duplicar o evento
6. evento atrasado que não regride o status
7. campanha de Ads
8. retentativa até `FAILED` quando o provider recusa o destino

`npm test` roda as regras de status, dedupe de contato e template, sem infra.

## Rotas

| Método | Rota | Auth |
| --- | --- | --- |
| `POST` | `/auth/register` | não |
| `POST` | `/auth/login` | não |
| `POST` | `/campaigns` | Bearer JWT |
| `GET` | `/campaigns` | Bearer JWT |
| `GET` | `/campaigns/:id` | Bearer JWT |
| `POST` | `/campaigns/:id/enqueue` | Bearer JWT |
| `POST` | `/webhooks/status` | header `x-webhook-secret` |
| `GET` | `/health` | não |

`POST /campaigns` responde `201` com `{ enqueued, campaign }`. O corpo:

```json
{
  "name": "Oferta de sexta",
  "channel": "WHATSAPP",
  "message": "Oi {{name}}",
  "contacts": [{ "name": "Ana", "phone": "+5511999990001" }]
}
```

No canal `ADS`, cada contato precisa de `externalId` em vez de telefone. `{{name}}`, `{{phone}}` e `{{externalId}}` são substituídos na hora do envio.

Webhook:

```json
{
  "provider": "WHATSAPP",
  "campaignId": "cmp_...",
  "contactId": "cnt_...",
  "status": "DELIVERED",
  "providerMessageId": "wa_..."
}
```

Status aceitos: `SENT`, `DELIVERED`, `READ`, `FAILED`. A mesma combinação de campanha, contato e status responde `200` com `duplicate: true` e não grava outro evento. Um status mais antigo responde `200` com `stale: true` e não regride o disparo.

## Idempotência

A chave é `campaignId` + `contactId`.

- existe no máximo um disparo para o par
- o job na fila usa o id `campaignId__contactId`, porque o BullMQ não aceita `:` no id
- o worker só toma o disparo se ele ainda está `PENDING` ou `QUEUED`; um `SENDING` preso há mais de 30s pode ser retomado
- o provider mock grava `provider_sends` com a mesma chave única antes de confirmar o envio
- o webhook grava `delivery_events.dedupe_key` como `campaignId:contactId:status`

`POST /campaigns/:id/enqueue` reenfileira só o que ainda não foi entregue ao provider. Serve para recuperar uma falha da fila depois que a campanha já foi gravada.

## Variáveis

Veja `.env.example`. `JWT_SECRET` e `WEBHOOK_SECRET` são obrigatórios. `MOCK_REJECT_TO` lista destinos que os providers mock recusam, separados por vírgula.
