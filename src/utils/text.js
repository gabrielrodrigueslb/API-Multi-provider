const PRESENTATION_SYNONYMS = {
  comprimido: ['comprimido', 'comprimidos', 'comp', 'cp', 'cpr'],
  capsula: ['capsula', 'capsulas', 'cap', 'cps'],
  gotas: ['gota', 'gotas', 'gts', 'solucao', 'solucoes', 'sol', 'sol oral', 'suspensao'],
  solucao: [
    'solucao',
    'solucoes',
    'sol',
    'gotas',
    'gts',
    'suspensao',
    'injetavel',
    'solucao injetavel',
    'suspensao injetavel',
  ],
  xarope: ['xarope'],
  pomada: ['pomada', 'pom'],
  creme: ['creme'],
  gel: ['gel'],
  spray: ['spray'],
  adesivo: ['adesivo', 'adesivos'],
  sache: ['sache', 'saches'],
};

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/+.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLooseText(value = '') {
  return normalizeText(value)
    .replace(/(\d),(\d)/g, '$1 $2')
    .replace(/[+/]/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeText(value = '') {
  return normalizeLooseText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 || /^\d+$/.test(token));
}

export function canonicalPresentation(value = '') {
  const normalized = normalizeText(value);

  if (!normalized) {
    return '';
  }

  for (const [canonical, variants] of Object.entries(PRESENTATION_SYNONYMS)) {
    if (variants.some((variant) => normalized.includes(normalizeText(variant)))) {
      return canonical;
    }
  }

  return normalized;
}

export function matchesPresentation(description, presentation) {
  const canonical = canonicalPresentation(presentation);

  if (!canonical) {
    return true;
  }

  const normalizedDescription = normalizeText(description);
  const variants = PRESENTATION_SYNONYMS[canonical] || [canonical];

  return variants.some((variant) => normalizedDescription.includes(normalizeText(variant)));
}

export function buildDosagePatterns(value, unit) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || !unit) {
    return [];
  }

  const numericText = String(numericValue).replace(/\.0+$/, '');
  const normalizedUnit = normalizeText(unit).replace(/\s+/g, '');
  const compactUnit = normalizedUnit.replace(/\//g, '');

  return Array.from(
    new Set([
      `${numericText}${normalizedUnit}`,
      `${numericText} ${normalizedUnit}`,
      `${numericText}/${normalizedUnit}`,
      `${numericText}${compactUnit}`,
      `${numericText} ${compactUnit}`,
    ]),
  );
}

export function matchesDosage(description, dosageValue, dosageUnit) {
  const patterns = buildDosagePatterns(dosageValue, dosageUnit);

  if (patterns.length === 0) {
    return true;
  }

  const normalizedDescription = normalizeText(description);
  return patterns.some((pattern) => normalizedDescription.includes(pattern));
}

export function buildSearchText(payload) {
  return [
    payload.produto,
    payload.apresentacao,
    payload.dosagem_valor && payload.dosagem_unidade
      ? `${payload.dosagem_valor}${payload.dosagem_unidade}`
      : '',
    payload.marca,
    payload.principio_ativo,
  ]
    .filter(Boolean)
    .join(' ');
}

export function textIncludesLoose(haystack, needle) {
  const normalizedHaystack = normalizeLooseText(haystack);
  const normalizedNeedle = normalizeLooseText(needle);

  if (!normalizedNeedle) {
    return false;
  }

  return normalizedHaystack.includes(normalizedNeedle);
}

export function countTokenOverlap(source, targetTokens = []) {
  if (!targetTokens.length) {
    return 0;
  }

  const sourceTokens = new Set(tokenizeText(source));
  return targetTokens.filter((token) => sourceTokens.has(token)).length;
}

export function matchesBrand(product, brand) {
  if (!brand) {
    return true;
  }

  const normalizedBrand = normalizeText(brand);

  return [
    product.description ?? product.descricao,
    product.social_name ?? product.nome_social,
    product.manufacturer ?? product.fabricante,
    product.classification ?? product.classificacao,
  ]
    .filter(Boolean)
    .some((value) => normalizeText(value).includes(normalizedBrand));
}

export function matchesActiveIngredient(product, activeIngredient) {
  if (!activeIngredient) {
    return true;
  }

  const normalizedIngredient = normalizeText(activeIngredient);

  return [
    product.active_ingredient ?? product.principio_ativo,
    product.description ?? product.descricao,
    product.social_name ?? product.nome_social,
  ]
    .filter(Boolean)
    .some((value) => normalizeText(value).includes(normalizedIngredient));
}
