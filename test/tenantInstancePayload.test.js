import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TENANT_DB_ADMIN_HOST = 'cache-db.internal';
process.env.TENANT_DB_ADMIN_PORT = '5433';
process.env.TENANT_DB_ADMIN_USER = 'trier_cache_admin';
process.env.TENANT_DB_ADMIN_PASSWORD = 'admin-secret';
process.env.TENANT_DB_ADMIN_SSL = 'true';

const { parseTenantInstancePayload } = await import('../src/utils/tenantInstancePayload.js');

test('parseTenantInstancePayload accepts valid instance payload', () => {
  const payload = parseTenantInstancePayload({
    name: 'complexo_loja06',
    trierToken: 'token-trier',
    database: 'complexofarma_loja06',
    apiKey: 'minha-chave',
  });

  assert.deepEqual(payload, {
    provider: 'trier',
    name: 'complexo_loja06',
    trierInstance: 'sgfpod1',
    trierBaseUrl: 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1',
    trierToken: 'token-trier',
    host: 'cache-db.internal',
    port: 5433,
    database: 'complexofarma_loja06',
    user: 'trier_cache_admin',
    password: 'admin-secret',
    ssl: true,
    cacheSchema: 'trier_cache',
    syncIncrementalCron: '0 */2 * * *',
    syncFullCron: '0 3 * * *',
    vetorUnidade: null,
    autoSync: false,
    autoSyncMode: 'bootstrap',
    apiKey: 'minha-chave',
    status: 'active',
  });
});

test('parseTenantInstancePayload ignores caller-supplied db connection for trier', () => {
  // host/port/user/password/ssl for trier always come from
  // TENANT_DB_ADMIN_* - anything the caller sends for those fields is
  // silently ignored, since every trier tenant shares the same cache DB.
  const payload = parseTenantInstancePayload({
    name: 'complexo_loja06',
    trierToken: 'token-trier',
    host: 'attacker-controlled-or-stale.example',
    port: 1,
    database: 'complexofarma_loja06',
    user: 'someone-else',
    password: 'whatever',
    ssl: false,
  });

  assert.equal(payload.host, 'cache-db.internal');
  assert.equal(payload.port, 5433);
  assert.equal(payload.user, 'trier_cache_admin');
  assert.equal(payload.password, 'admin-secret');
  assert.equal(payload.ssl, true);
});

test('parseTenantInstancePayload ignores old routing fields in instance payload', () => {
  const payload = parseTenantInstancePayload({
    name: 'complexo_loja06',
    trierToken: 'token-trier',
    database: 'complexofarma_loja06',
    unidadeNegocioId: 74579,
    estoqueMinimo: 0,
  });

  assert.equal(Object.hasOwn(payload, 'unidadeNegocioId'), false);
  assert.equal(Object.hasOwn(payload, 'estoqueMinimo'), false);
});

test('parseTenantInstancePayload rejects missing required fields', () => {
  assert.throws(
    () =>
      parseTenantInstancePayload({
        database: 'complexofarma_loja06',
        trierToken: 'token-trier',
      }),
    {
      message: 'O campo "name" e obrigatorio.',
    },
  );
});

test('parseTenantInstancePayload rejects missing database for trier', () => {
  assert.throws(
    () =>
      parseTenantInstancePayload({
        name: 'complexo_loja06',
        trierToken: 'token-trier',
      }),
    {
      message: 'O campo "database" e obrigatorio.',
    },
  );
});

test('parseTenantInstancePayload rejects invalid numeric values for alpha7 port', () => {
  assert.throws(
    () =>
      parseTenantInstancePayload({
        provider: 'alpha7',
        name: 'cliente_alpha',
        host: 'loja06.complexopharma.com.br',
        port: 0,
        database: 'complexofarma_loja06',
        user: 'unico_contato_bd',
        password: 'segredo',
      }),
    {
      message: 'O campo "port" deve ser um inteiro positivo.',
    },
  );
});

test('parseTenantInstancePayload accepts explicit Trier overrides when provided', () => {
  const payload = parseTenantInstancePayload({
    name: 'cliente_custom',
    trierInstance: 'custom-instance',
    trierBaseUrl: 'https://outra-url.exemplo/sgfpod1',
    trierToken: 'token-trier',
    database: 'cliente_custom',
  });

  assert.equal(payload.trierInstance, 'custom-instance');
  assert.equal(payload.trierBaseUrl, 'https://outra-url.exemplo/sgfpod1');
});

test('parseTenantInstancePayload accepts auto sync options', () => {
  const payload = parseTenantInstancePayload({
    name: 'cliente_sync',
    trierToken: 'token-trier',
    database: 'cliente_sync',
    autoSync: true,
    autoSyncMode: 'full',
  });

  assert.equal(payload.autoSync, true);
  assert.equal(payload.autoSyncMode, 'full');
});

test('parseTenantInstancePayload accepts alpha7 without trierToken', () => {
  const payload = parseTenantInstancePayload({
    provider: 'alpha7',
    name: 'cliente_alpha',
    host: 'localhost',
    database: 'cliente_alpha',
    user: 'postgres',
    password: 'postgres',
    autoSync: true,
  });

  assert.equal(payload.provider, 'alpha7');
  assert.equal(payload.trierToken, '');
  assert.equal(payload.autoSync, false);
  assert.equal(payload.autoSyncMode, 'bootstrap');
  // alpha7 is the client's own real database - unlike trier, it must come
  // from the request, not the shared cache DB admin env.
  assert.equal(payload.host, 'localhost');
  assert.equal(payload.user, 'postgres');
});

test('parseTenantInstancePayload nulls trier-only fields for alpha7 and vetor', () => {
  const alpha7 = parseTenantInstancePayload({
    provider: 'alpha7',
    name: 'cliente_alpha',
    host: 'localhost',
    database: 'cliente_alpha',
    user: 'postgres',
    password: 'postgres',
  });

  assert.equal(alpha7.trierInstance, null);
  assert.equal(alpha7.trierBaseUrl, null);
  assert.equal(alpha7.cacheSchema, null);
  assert.equal(alpha7.syncIncrementalCron, null);
  assert.equal(alpha7.syncFullCron, null);

  const vetor = parseTenantInstancePayload({
    provider: 'vetor',
    name: 'cliente_vetor',
    vetorToken: 'token-vetor',
    unidade: '2',
  });

  assert.equal(vetor.trierInstance, null);
  assert.equal(vetor.trierBaseUrl, null);
  assert.equal(vetor.cacheSchema, null);
  assert.equal(vetor.syncIncrementalCron, null);
  assert.equal(vetor.syncFullCron, null);
  assert.equal(vetor.vetorUnidade, '2');
});

test('parseTenantInstancePayload requires unidade for vetor', () => {
  assert.throws(
    () =>
      parseTenantInstancePayload({
        provider: 'vetor',
        name: 'cliente_vetor',
        vetorToken: 'token-vetor',
      }),
    {
      message: 'O campo "unidade" e obrigatorio.',
    },
  );
});

test('parseTenantInstancePayload rejects invalid provider', () => {
  assert.throws(
    () =>
      parseTenantInstancePayload({
        provider: 'outro',
        name: 'cliente_sync',
        host: 'localhost',
        database: 'cliente_sync',
        user: 'postgres',
        password: 'postgres',
      }),
    /provider/,
  );
});

test('parseTenantInstancePayload rejects invalid autoSyncMode', () => {
  assert.throws(
    () =>
      parseTenantInstancePayload({
        name: 'cliente_sync',
        trierToken: 'token-trier',
        database: 'cliente_sync',
        autoSyncMode: 'agora',
      }),
    /autoSyncMode/,
  );
});
