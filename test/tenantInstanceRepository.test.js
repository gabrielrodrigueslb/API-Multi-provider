import test from 'node:test';
import assert from 'node:assert/strict';

import { hashApiKey } from '../src/repositories/tenantInstanceRepository.js';

test('hashApiKey is deterministic and does not return raw token', () => {
  const hashA = hashApiKey('minha-chave');
  const hashB = hashApiKey('minha-chave');
  const hashC = hashApiKey('outra-chave');

  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashC);
  assert.notEqual(hashA, 'minha-chave');
  assert.equal(hashA.length, 64);
});
