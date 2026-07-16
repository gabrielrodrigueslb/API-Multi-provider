# API Multi-provider

API Node.js para operar multiplos clientes com dois providers no mesmo codigo:

- `trier`: sincroniza produtos e descontos para um cache PostgreSQL por cliente
- `alpha7`: consulta diretamente o banco do cliente

O consumo continua unificado por `x-api-key`.

## O que a API faz

- cadastra clientes em um banco master
- salva provider, credenciais de acesso e dados do banco do cliente
- para Trier, provisiona o banco/schema do cache no momento do cadastro
- para Trier, sincroniza produtos e descontos com BullMQ + Redis
- para Alpha 7, consulta direto no banco do cliente
- consulta produtos por EAN usando a `apiKey` do cliente
- retorna somente descontos/promocoes ativas no momento da consulta

## Requisitos

- Node.js 20+
- PostgreSQL
- Redis
- Docker Desktop ou outro runtime Docker compativel, caso va subir o Redis por container

## Configuracao

Copie `.env.example` para `.env`.

Exemplo local:

```env
PORT=3000

CONTROL_DB_HOST=localhost
CONTROL_DB_PORT=5432
CONTROL_DB_NAME=banco_eans
CONTROL_DB_SCHEMA=instancias
CONTROL_DB_USER=postgres
CONTROL_DB_PASSWORD=postgres
CONTROL_DB_SSL=false

ADMIN_API_KEY=admin-teste

REDIS_URL=redis://127.0.0.1:6379
SYNC_INCREMENTAL_CRON=0 */2 * * *
SYNC_FULL_CRON=0 3 * * *
SYNC_INCREMENTAL_FALLBACK_HOURS=2

TRIER_DEFAULT_BASE_URL=https://api-sgf-gateway.triersistemas.com.br/sgfpod1
TRIER_TIMEOUT_MS=30000
TRIER_PAGE_SIZE=200
TRIER_REMOVE_STOCK_RESTRICTION=true

TENANT_DB_PROVISION_ENABLED=true
TENANT_DB_ADMIN_DATABASE=postgres
TENANT_DB_ADMIN_USER=postgres
TENANT_DB_ADMIN_PASSWORD=postgres
TENANT_DB_ADMIN_SSL=false
```

## Executar

### Subir o Redis com Docker

Se voce ainda nao tiver Redis local, pode subir com Docker:

```bash
docker run --name redis-local -p 6379:6379 redis
```

Se quiser manter em background:

```bash
docker run -d --name redis-local -p 6379:6379 redis
```

Se o container ja existir e estiver parado:

```bash
docker start redis-local
```

Teste rapido da porta:

```bash
docker ps
```

O `.env` deste projeto ja aponta para:

```env
REDIS_URL=redis://127.0.0.1:6379
```

Sem Redis ativo, a API sobe, mas BullMQ nao processa sincronizacoes Trier.

### Subir a API

```bash
npm install
npm run dev
```

No PowerShell, se necessario:

```bash
npm.cmd install
npm.cmd run dev
```

## Fluxo atual

1. A API sobe conectando no banco master.
2. Voce cria um cliente em `POST /api/admin/clientes/trier` ou `POST /api/admin/clientes/alpha7`.
3. Nesse momento a API:
   - valida os dados
   - grava o cliente no banco master
   - devolve a `apiKey`
   - para `provider=trier`, cria o database do cliente quando `TENANT_DB_PROVISION_ENABLED=true`
   - para `provider=trier`, cria o schema `trier_cache` e as tabelas locais
   - para `provider=trier`, opcionalmente ja enfileira a sincronizacao inicial quando `autoSync=true`
4. Se o cliente for Trier, BullMQ mantem o cliente sincronizado pelos crons configurados.
5. O consumo da API acontece por rota especifica do provider usando a `apiKey` do cliente.

Observacao:

- o provisionamento do banco ja faz parte da criacao do cliente Trier
- nao existe mais necessidade operacional de chamar um endpoint separado para preparar banco/schema

## Estrutura persistida por cliente

Para clientes Trier, no banco de cache do cliente, schema `trier_cache`:

- `products`
- `product_discounts`
- `sync_state`

## Autenticacao

### Administracao

Use `ADMIN_API_KEY`.

Header:

```http
x-api-key: admin-teste
```

### Consumo por cliente

Use a `apiKey` retornada na criacao do cliente.

Headers aceitos:

```http
x-api-key: API_KEY_DO_CLIENTE
```

ou

```http
Authorization: Bearer API_KEY_DO_CLIENTE
```

## Endpoints

### `GET /health`

Verifica se a API esta viva.

### `GET /api/admin/clientes`

Lista clientes cadastrados no banco master.

### `POST /api/admin/clientes/trier`

Cria um cliente Trier e provisiona o banco/schema do cache.

Body:

```json
{
  "name": "drogariatotalsaojosebilac",
  "trierToken": "TOKEN_DA_TRIER",
  "host": "localhost",
  "port": 5432,
  "database": "cliente_drogariatotalsaojosebilac_cache",
  "user": "postgres",
  "password": "postgres",
  "ssl": false
}
```

Campos opcionais:

- `trierInstance`
- `trierBaseUrl`
- `cacheSchema`
- `syncIncrementalCron`
- `syncFullCron`
- `apiKey`
- `status`
- `autoSync`
- `autoSyncMode`

Defaults:

- `trierInstance = sgfpod1`
- `trierBaseUrl = https://api-sgf-gateway.triersistemas.com.br/sgfpod1`
- `cacheSchema = trier_cache`
- `autoSync = false`
- `autoSyncMode = bootstrap`

Resposta:

```json
{
  "status": "ok",
  "instancia": {
    "id": 1,
    "name": "drogariatotalsaojosebilac",
    "trierInstance": "sgfpod1",
    "trierBaseUrl": "https://api-sgf-gateway.triersistemas.com.br/sgfpod1",
    "host": "localhost",
    "port": 5432,
    "database": "cliente_drogariatotalsaojosebilac_cache",
    "user": "postgres",
    "ssl": false,
    "cacheSchema": "trier_cache",
    "syncIncrementalCron": "0 */2 * * *",
    "syncFullCron": "0 3 * * *",
    "status": "active"
  },
  "apiKey": "API_KEY_DO_CLIENTE",
  "provisionado": true,
  "sincronizacao": null
}
```

Exemplo criando o cliente e ja disparando a sincronizacao inicial:

```json
{
  "name": "drogariatotalsaojosebilac",
  "trierToken": "TOKEN_DA_TRIER",
  "host": "localhost",
  "port": 5432,
  "database": "cliente_drogariatotalsaojosebilac_cache",
  "user": "postgres",
  "password": "postgres",
  "ssl": false,
  "autoSync": true,
  "autoSyncMode": "bootstrap"
}
```

### `POST /api/admin/clientes/alpha7`

Cria um cliente Alpha 7.

Body:

```json
{
  "name": "cliente_alpha7",
  "host": "localhost",
  "port": 5432,
  "database": "alpha7_cliente01",
  "user": "postgres",
  "password": "postgres",
  "ssl": false
}
```

Observacoes:

- `trierToken` nao e usado para Alpha 7
- `autoSync` e BullMQ so se aplicam a Trier

### `POST /api/admin/clientes/:id/testar-conexao`

Testa a conexao com o banco do cliente.

### `POST /api/admin/clientes/trier/:id/sincronizar`

Enfileira sincronizacao manual de um cliente Trier.

Body:

```json
{
  "mode": "bootstrap"
}
```

Valores aceitos para `mode`:

- `bootstrap`
- `full`
- `incremental`

Resposta:

```json
{
  "status": "ok",
  "jobId": "1:bootstrap:123456789",
  "tenantId": 1,
  "mode": "bootstrap"
}
```

### `POST /api/trier/consultar-eans`

Consulta produtos do cliente Trier por EAN.

Body:

```json
{
  "eans": [
    "17500435023938",
    "17500435024003",
    "17896007547200"
  ]
}
```

Resposta:

```json
{
  "status": "ok",
  "produtos": [
    {
      "ean": "17500435023938",
      "codigoProduto": "22897",
      "nome": "FR PAMPERS CONF SEC G 38UN",
      "valorVenda": 80,
      "estoque": 3,
      "ativo": true,
      "melhorDesconto": 71.5,
      "descontos": [
        {
          "tipo": "melhor",
          "chave": "melhor:22897:17500435023938",
          "produtoCodigo": "22897",
          "ean": "17500435023938",
          "nomeProduto": "FR PAMPERS CONF SEC G 38UN",
          "dataInicio": null,
          "dataFim": null,
          "valorReferencia": 71.5
        },
        {
          "tipo": "vigencia",
          "chave": "vigencia:2222001:22897:2025-01-01:2099-01-01",
          "produtoCodigo": "22897",
          "ean": null,
          "nomeProduto": null,
          "dataInicio": "2025-01-01T00:00:00.000Z",
          "dataFim": "2099-01-01T00:00:00.000Z",
          "valorReferencia": 71.5
        }
      ]
    }
  ]
}
```

### `POST /api/alpha7/consultar-eans`

Consulta produtos do cliente Alpha 7 por EAN.

Body exemplo:

```json
{
  "eans": [
    "7891058002916"
  ],
  "unidadeNegocioId": 134644
}
```

Observacoes:

- `unidadeNegocioId` e obrigatorio para consultas Alpha 7
- `unidade_negocio_id` tambem e aceito como alias

Resposta exemplo:

```json
{
  "status": "ok",
  "produtos": [
    {
      "ean": "7891234567890",
      "codigoProduto": null,
      "nome": null,
      "valorVenda": 25.9,
      "estoque": 8,
      "ativo": true,
      "melhorDesconto": 19.9,
      "descontos": [
        {
          "tipo": "melhor",
          "chave": "alpha7:7891234567890",
          "produtoCodigo": null,
          "ean": "7891234567890",
          "nomeProduto": null,
          "dataInicio": null,
          "dataFim": null,
          "valorReferencia": 19.9
        }
      ],
      "leve": null,
      "pague": null
    }
  ]
}
```

## Regras da consulta

- aceita apenas array de `eans`
- remove duplicados preservando ordem
- Trier consulta pelo cache local do cliente
- Alpha 7 consulta direto no banco do cliente
- retorna apenas produtos encontrados
- retorna apenas descontos ativos naquele momento
- `melhorDesconto` usa o menor valor promocional ativo encontrado

## Sincronizacao automatica

Enquanto API e Redis estiverem ativos, para clientes Trier:

- incremental: conforme `SYNC_INCREMENTAL_CRON`
- full: conforme `SYNC_FULL_CRON`

Por cliente Trier, os crons tambem podem ser persistidos no cadastro:

- `syncIncrementalCron`
- `syncFullCron`

## Exemplos para Insomnia

### Criar cliente

- Metodo: `POST`
- URL: `http://localhost:3000/api/admin/clientes/trier`

Headers:

```http
Content-Type: application/json
x-api-key: admin-teste
```

Body:

```json
{
  "name": "drogariatotalsaojosebilac",
  "trierToken": "TOKEN_DA_TRIER",
  "host": "localhost",
  "port": 5432,
  "database": "cliente_drogariatotalsaojosebilac_cache",
  "user": "postgres",
  "password": "postgres",
  "ssl": false,
  "autoSync": true,
  "autoSyncMode": "bootstrap"
}
```

### Sincronizacao inicial

- Metodo: `POST`
- URL: `http://localhost:3000/api/admin/clientes/trier/1/sincronizar`

Headers:

```http
Content-Type: application/json
x-api-key: admin-teste
```

Body:

```json
{
  "mode": "bootstrap"
}
```

### Consultar EANs

- Metodo: `POST`
- URL: `http://localhost:3000/api/trier/consultar-eans`

Headers:

```http
Content-Type: application/json
x-api-key: API_KEY_DO_CLIENTE
```

Body:

```json
{
  "eans": [
    "17500435023938",
    "17500435024003"
  ]
}
```

## Observacoes operacionais

- se o Redis cair, a fila nao processa sincronizacoes
- se a API cair, os agendamentos BullMQ nao executam
- se o token Trier estiver invalido, as sincronizacoes Trier falham com erro de integracao
- clientes Alpha 7 nao dependem de BullMQ para consultar EANs
- `CLIENT_API_KEYS_JSON` continua apenas como fallback legado
