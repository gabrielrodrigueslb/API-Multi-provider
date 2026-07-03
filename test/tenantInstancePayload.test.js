import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTenantInstancePayload } from '../src/utils/tenantInstancePayload.js';

test('parseTenantInstancePayload accepts valid instance payload', () => {
  const payload = parseTenantInstancePayload({
    name: 'complexo_loja06',
    trierToken: 'token-trier',
    host: 'loja06.complexopharma.com.br',
    port: 5432,
    database: 'complexofarma_loja06',
    user: 'unico_contato_bd',
    password: 'segredo',
    ssl: false,
    apiKey: 'minha-chave',
  });

  assert.deepEqual(payload, {
    name: 'complexo_loja06',
    trierInstance: 'sgfpod1',
    trierBaseUrl: 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1',
    trierToken: 'token-trier',
    host: 'loja06.complexopharma.com.br',
    port: 5432,
    database: 'complexofarma_loja06',
    user: 'unico_contato_bd',
    password: 'segredo',
    ssl: false,
    cacheSchema: 'trier_cache',
    syncIncrementalCron: '0 */2 * * *',
    syncFullCron: '0 3 * * *',
    autoSync: false,
    autoSyncMode: 'bootstrap',
    apiKey: 'minha-chave',
    status: 'active',
  });
});

test('parseTenantInstancePayload ignores old routing fields in instance payload', () => {
  const payload = parseTenantInstancePayload({
    name: 'complexo_loja06',
    trierToken: 'token-trier',
    host: 'loja06.complexopharma.com.br',
    port: 5432,
    database: 'complexofarma_loja06',
    user: 'unico_contato_bd',
    password: 'segredo',
    ssl: false,
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
        host: 'loja06.complexopharma.com.br',
        database: 'complexofarma_loja06',
        user: 'unico_contato_bd',
        password: 'segredo',
        trierToken: 'token-trier',
      }),
    {
      message: 'O campo "name" e obrigatorio.',
    },
  );
});

test('parseTenantInstancePayload rejects invalid numeric values', () => {
  assert.throws(
    () =>
      parseTenantInstancePayload({
        name: 'complexo_loja06',
        trierToken: 'token-trier',
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
    host: 'localhost',
    database: 'cliente_custom',
    user: 'postgres',
    password: 'postgres',
  });

  assert.equal(payload.trierInstance, 'custom-instance');
  assert.equal(payload.trierBaseUrl, 'https://outra-url.exemplo/sgfpod1');
});

test('parseTenantInstancePayload accepts auto sync options', () => {
  const payload = parseTenantInstancePayload({
    name: 'cliente_sync',
    trierToken: 'token-trier',
    host: 'localhost',
    database: 'cliente_sync',
    user: 'postgres',
    password: 'postgres',
    autoSync: true,
    autoSyncMode: 'full',
  });

  assert.equal(payload.autoSync, true);
  assert.equal(payload.autoSyncMode, 'full');
});

test('parseTenantInstancePayload rejects invalid autoSyncMode', () => {
  assert.throws(
    () =>
      parseTenantInstancePayload({
        name: 'cliente_sync',
        trierToken: 'token-trier',
        host: 'localhost',
        database: 'cliente_sync',
        user: 'postgres',
        password: 'postgres',
        autoSyncMode: 'agora',
      }),
    /autoSyncMode/,
  );
});
