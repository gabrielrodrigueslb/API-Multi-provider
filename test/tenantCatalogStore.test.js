import test from 'node:test';
import assert from 'node:assert/strict';

import { _internals } from '../src/services/tenantCatalogStore.js';

test('buildSourceKey combines the most relevant discount identifiers', () => {
  const key = _internals.buildSourceKey('parceiro_produto', {
    codigoProduto: 12,
    codigoBarras: '789',
    codigoParceiro: 7,
    dataInicio: '2026-01-01',
  });

  assert.equal(key, 'parceiro_produto:12:789:7:2026-01-01');
});

test('normalizeEan strips non-digits and leading zeroes', () => {
  assert.equal(_internals.normalizeEan(' 000789-10 '), '78910');
});
