import test from 'node:test';
import assert from 'node:assert/strict';

import { env } from '../src/config/env.js';
import { parseConsultEansPayload } from '../src/utils/consultEansPayload.js';

test('parseConsultEansPayload rejects missing eans', () => {
  assert.throws(() => parseConsultEansPayload({}), /eans/);
});

test('parseConsultEansPayload rejects empty eans array', () => {
  assert.throws(() => parseConsultEansPayload({ eans: [] }), /pelo menos um item/);
});

test('parseConsultEansPayload rejects client routing fields in body', () => {
  assert.throws(() => parseConsultEansPayload({ eans: ['789'], client_key: 'cliente' }), /nao aceita/);
  assert.throws(
    () => parseConsultEansPayload({ eans: ['789'], client_database: { host: 'db' } }),
    /nao aceita/,
  );
});

test('parseConsultEansPayload rejects above configured max batch size', () => {
  const original = env.maxEanBatchSize;
  env.maxEanBatchSize = 2;

  try {
    assert.throws(() => parseConsultEansPayload({ eans: ['1', '2', '3'] }), /excede o limite/);
  } finally {
    env.maxEanBatchSize = original;
  }
});

test('parseConsultEansPayload accepts string eans and preserves order', () => {
  const parsed = parseConsultEansPayload({
    eans: [' 00123 ', '456'],
    cadernoOfertaId: 5840993,
    unidadeNegocioId: 74579,
  });
  assert.deepEqual(parsed, {
    eans: ['00123', '456'],
    cadernoOfertaId: 5840993,
    unidadeNegocioId: 74579,
  });
});

test('parseConsultEansPayload rejects invalid cadernoOfertaId', () => {
  assert.throws(() => parseConsultEansPayload({ eans: ['123'], cadernoOfertaId: 'abc' }), /cadernoOfertaId/);
  assert.throws(() => parseConsultEansPayload({ eans: ['123'], cadernoOfertaId: -1 }), /cadernoOfertaId/);
});

test('parseConsultEansPayload rejects invalid unidadeNegocioId', () => {
  assert.throws(() => parseConsultEansPayload({ eans: ['123'], unidadeNegocioId: 'abc' }), /unidadeNegocioId/);
  assert.throws(() => parseConsultEansPayload({ eans: ['123'], unidadeNegocioId: 0 }), /unidadeNegocioId/);
});
