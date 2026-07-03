import test from 'node:test';
import assert from 'node:assert/strict';

import { env } from '../src/config/env.js';
import { authenticateAdminApiKey } from '../src/middlewares/adminApiKeyAuth.js';

function createResponseDouble() {
  return {
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
}

test('authenticateAdminApiKey rejects invalid key', () => {
  const originalAdminApiKey = env.adminApiKey;
  env.adminApiKey = 'segredo-admin';

  try {
    const response = createResponseDouble();
    let nextCalled = false;

    authenticateAdminApiKey({ headers: { 'x-api-key': 'invalida' } }, response, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 401);
    assert.equal(response.payload?.status, 'error');
  } finally {
    env.adminApiKey = originalAdminApiKey;
  }
});

test('authenticateAdminApiKey accepts bearer token', () => {
  const originalAdminApiKey = env.adminApiKey;
  env.adminApiKey = 'segredo-admin';

  try {
    const response = createResponseDouble();
    let nextCalled = false;

    authenticateAdminApiKey(
      { headers: { authorization: 'Bearer segredo-admin' } },
      response,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
    assert.equal(response.statusCode, null);
  } finally {
    env.adminApiKey = originalAdminApiKey;
  }
});
