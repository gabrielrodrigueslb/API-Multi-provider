import test from 'node:test';
import assert from 'node:assert/strict';

import { _internals } from '../src/services/trierApiClient.js';

test('extractItems supports raw arrays and wrapped payloads', () => {
  assert.deepEqual(_internals.extractItems([{ codigo: 1 }]), [{ codigo: 1 }]);
  assert.deepEqual(_internals.extractItems({ data: [{ codigo: 2 }] }), [{ codigo: 2 }]);
  assert.deepEqual(_internals.extractItems({ lista: [{ codigo: 3 }] }), [{ codigo: 3 }]);
});

test('extractTotal reads common pagination shapes', () => {
  assert.equal(_internals.extractTotal({ total: 10 }), 10);
  assert.equal(_internals.extractTotal({ totalRegistros: '20' }), 20);
  assert.equal(_internals.extractTotal({ pagination: { total: 30 } }), 30);
  assert.equal(_internals.extractTotal({}), null);
});

test('toTrierDate sends only the date accepted by incremental endpoints', () => {
  assert.equal(_internals.toTrierDate('2026-08-26T06:15:23.861Z'), '2026-08-26');
  assert.throws(() => _internals.toTrierDate('not-a-date'), /Data invalida/);
});
