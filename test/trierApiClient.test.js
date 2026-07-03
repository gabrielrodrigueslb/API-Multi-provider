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
