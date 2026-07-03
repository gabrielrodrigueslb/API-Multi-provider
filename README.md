# API Trier Multi-tenant

API Node.js para integrar clientes Trier, sincronizar produtos e descontos para um cache PostgreSQL por cliente e consultar produtos por EAN com autenticacao por `x-api-key`.

## O que a API faz

- cadastra clientes em um banco master
- salva token Trier e credenciais do banco de cache do cliente
- provisiona o banco/schema do cliente no momento do cadastro
- sincroniza produtos e descontos da Trier com BullMQ + Redis
- consulta produtos por EAN usando a `apiKey` do cliente
- retorna somente descontos ativos no momento da consulta

## Requisitos

- Node.js 20+
- PostgreSQL
- Redis

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
2. Voce cria um cliente em `POST /api/admin/clientes`.
3. Nesse momento a API:
   - valida os dados
   - cria o database do cliente quando `TENANT_DB_PROVISION_ENABLED=true`
   - cria o schema `trier_cache` e as tabelas locais
   - grava o cliente no banco master
   - devolve a `apiKey`
   - opcionalmente ja enfileira a sincronizacao inicial quando `autoSync=true`
4. Voce dispara a carga inicial com `POST /api/admin/clientes/:id/sincronizar` usando `mode=bootstrap`.
5. Depois disso, BullMQ mantem o cliente sincronizado pelos crons configurados.
6. O consumo da API acontece por `POST /api/consultar-eans` usando a `apiKey` do cliente.

Observacao:

- o provisionamento do banco ja faz parte da criacao do cliente
- nao existe mais necessidade operacional de chamar um endpoint separado para preparar banco/schema

## Estrutura persistida por cliente

No banco de cache do cliente, schema `trier_cache`:

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

### `POST /api/admin/clientes`

Cria o cliente e provisiona o banco/schema do cache.

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

### `POST /api/admin/clientes/:id/testar-conexao`

Testa a conexao com o banco do cliente.

### `POST /api/admin/clientes/:id/sincronizar`

Enfileira sincronizacao manual.

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

### `POST /api/consultar-eans`

Consulta produtos do cliente por EAN.

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

## Regras da consulta

- aceita apenas array de `eans`
- remove duplicados preservando ordem
- consulta pelo cache local do cliente
- retorna apenas produtos encontrados
- retorna apenas descontos ativos naquele momento
- `melhorDesconto` usa o menor valor promocional ativo encontrado

## Sincronizacao automatica

Enquanto API e Redis estiverem ativos:

- incremental: conforme `SYNC_INCREMENTAL_CRON`
- full: conforme `SYNC_FULL_CRON`

Por cliente, os crons tambem podem ser persistidos no cadastro:

- `syncIncrementalCron`
- `syncFullCron`

## Exemplos para Insomnia

### Criar cliente

- Metodo: `POST`
- URL: `http://localhost:3000/api/admin/clientes`

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
- URL: `http://localhost:3000/api/admin/clientes/1/sincronizar`

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
- URL: `http://localhost:3000/api/consultar-eans`

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
- se a API cair, os agendamentos nao executam
- se o token Trier estiver invalido, as sincronizacoes falham com erro de integracao
- `CLIENT_API_KEYS_JSON` continua apenas como fallback legado
