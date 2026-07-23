import test from 'node:test';
import assert from 'node:assert/strict';

import { env } from '../src/config/env.js';
import { resolveClientDatabaseConfigByApiKey } from '../src/config/clientDatabase.js';
import { _internals, authenticateClientApiKey } from '../src/middlewares/clientApiKeyAuth.js';

test('extractProvidedApiKey prefers bearer token and supports x-api-key', () => {
  assert.equal(
    _internals.extractProvidedApiKey({ authorization: 'Bearer segredo', 'x-api-key': 'fallback' }),
    'segredo',
  );
  assert.equal(_internals.extractProvidedApiKey({ 'x-api-key': 'chave' }), 'chave');
});

test('resolveClientDatabaseConfigByApiKey returns client config from registry', () => {
  const original = env.clientApiKeyRegistry;
  env.clientApiKeyRegistry = {
    chave123: {
      provider: 'automatiza',
      client_name: 'cliente_a',
      host: 'db.local',
      port: 3306,
      database: 'cliente_a',
      user: 'root',
      password: 'secret',
      ssl: false,
      shop_id: 22,
    },
  };

  try {
    const resolved = resolveClientDatabaseConfigByApiKey('chave123');
    assert.equal(resolved?.name, 'cliente_a');
    assert.equal(resolved?.provider, 'automatiza');
    assert.equal(resolved?.host, 'db.local');
    assert.equal(resolved?.database, 'cliente_a');
    assert.equal(resolved?.automatizaShopId, 22);
  } finally {
    env.clientApiKeyRegistry = original;
  }
});

test('authenticateClientApiKey rejects invalid key and accepts valid registry key', async () => {
  const original = env.clientApiKeyRegistry;
  const originalLookupTenantByApiKey = _internals.lookupTenantByApiKey;
  env.clientApiKeyRegistry = {
    chave123: {
      provider: 'automatiza',
      client_name: 'cliente_a',
      host: 'db.local',
      port: 3306,
      database: 'cliente_a',
      user: 'root',
      password: 'secret',
      ssl: false,
      shop_id: 22,
    },
  };
  _internals.lookupTenantByApiKey = async () => null;

  try {
    const invalidResponse = {
      statusCode: null,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.payload = body;
        return this;
      },
    };

    let nextCalled = false;
    await authenticateClientApiKey(
      { headers: { 'x-api-key': 'invalida' } },
      invalidResponse,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, false);
    assert.equal(invalidResponse.statusCode, 401);
    assert.equal(invalidResponse.payload?.status, 'error');

    const validRequest = { headers: { authorization: 'Bearer chave123' } };
    const validResponse = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    };
    let validNextCalled = false;

    await authenticateClientApiKey(validRequest, validResponse, () => {
      validNextCalled = true;
    });

    assert.equal(validNextCalled, true);
    assert.equal(validRequest.clientApiKey, 'chave123');
    assert.equal(validRequest.clientDatabase?.name, 'cliente_a');
  } finally {
    env.clientApiKeyRegistry = original;
    _internals.lookupTenantByApiKey = originalLookupTenantByApiKey;
  }
});
