import test from 'node:test';
import assert from 'node:assert/strict';

import { _internals } from '../src/services/tenantCatalogQueryService.js';

test('pickDiscountMetric only accepts monetary promotional values', () => {
  assert.equal(_internals.pickDiscountMetric({ valorPromocao: '9.99', percentualDesconto: '10' }), 9.99);
  assert.equal(_internals.pickDiscountMetric({ percentualDescontoMax: '12.5' }), null);
  assert.equal(_internals.pickDiscountMetric({}), null);
});

test('pickDiscountPercent prefers the maximum discount from Trier', () => {
  assert.equal(_internals.pickDiscountPercent({ percentualDesconto: '0', percentualDescontoMax: '50' }), 50);
  assert.equal(_internals.pickDiscountPercent({ percentualDesconto: '15' }), 15);
  assert.equal(_internals.pickDiscountPercent({ percentualDescontoMax: '0' }), null);
});

test('getMaximumDiscountPercent exposes the highest product or campaign percentage', () => {
  assert.equal(
    _internals.getMaximumDiscountPercent(
      { percentualDesconto: 0, percentualDescontoMax: 50 },
      [{ percentualDesconto: 25 }],
    ),
    50,
  );
});

test('buildBestDiscount returns lower promotional value when available', () => {
  const discounts = [{ valorReferencia: 14.9 }, { valorReferencia: 9.5 }, { valorReferencia: null }];
  assert.equal(_internals.buildBestDiscount(discounts, 19.9), 9.5);
  assert.equal(_internals.buildBestDiscount([], 19.9), 19.9);
  assert.equal(_internals.buildBestDiscount([], null), null);
});

test('isDiscountActiveNow keeps only currently active discounts', () => {
  const now = Date.UTC(2026, 6, 3, 12, 0, 0);

  assert.equal(_internals.isDiscountActiveNow({ dataInicio: null, dataFim: null }, now), true);
  assert.equal(
    _internals.isDiscountActiveNow(
      { dataInicio: Date.UTC(2026, 6, 1), dataFim: Date.UTC(2026, 6, 5) },
      now,
    ),
    true,
  );
  assert.equal(
    _internals.isDiscountActiveNow(
      { dataInicio: Date.UTC(2026, 6, 4), dataFim: Date.UTC(2026, 6, 5) },
      now,
    ),
    false,
  );
  assert.equal(
    _internals.isDiscountActiveNow(
      { dataInicio: Date.UTC(2026, 5, 1), dataFim: Date.UTC(2026, 6, 2) },
      now,
    ),
    false,
  );
});
