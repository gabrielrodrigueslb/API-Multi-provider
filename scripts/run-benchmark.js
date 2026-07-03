import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query } from '../src/config/database.js';
import { searchProducts } from '../src/services/productSearchService.js';
import { normalizeText } from '../src/utils/text.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const outputPath = join(projectRoot, 'benchmark-results.json');

const PERF_CLASSIFICATIONS = [
  'Esmalte',
  'Hidratante',
  'Shampoo',
  'Sabonetes',
  'Tinturas',
  'Condicionador',
  'Protetor Solar',
  'Desodorante',
  'Máscara',
  'Kit Capilar',
  'Creme De Pentear',
  'Antirugas',
  'Acne',
  'Limpeza',
  'Finalizador',
  'perfumaria',
];

const PRODUCT_TYPE_BY_CLASSIFICATION = new Map([
  ['Esmalte', 'esmalte'],
  ['Hidratante', 'hidratante'],
  ['Shampoo', 'shampoo'],
  ['Sabonetes', 'sabonete'],
  ['Tinturas', 'tintura'],
  ['Condicionador', 'condicionador'],
  ['Protetor Solar', 'protetor solar'],
  ['Desodorante', 'desodorante'],
  ['Máscara', 'mascara'],
  ['Kit Capilar', 'kit capilar'],
  ['Creme De Pentear', 'creme de pentear'],
  ['Antirugas', 'antirugas'],
  ['Acne', 'limpeza facial'],
  ['Limpeza', 'limpeza facial'],
  ['Finalizador', 'finalizador'],
  ['perfumaria', null],
]);

function safeJsonParse(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractPresentationFromText(value = '') {
  const normalized = normalizeText(value);

  if (normalized.includes('comprim')) return 'comprimido';
  if (normalized.includes('capsul')) return 'capsula';
  if (normalized.includes('gota') || normalized.includes('gts')) return 'gotas';
  if (normalized.includes('xarope')) return 'xarope';
  if (normalized.includes('creme')) return 'creme';
  if (normalized.includes('pomada')) return 'pomada';
  if (normalized.includes('spray')) return 'spray';
  if (normalized.includes('solucao') || normalized.includes('suspensao')) return 'solucao';

  return null;
}

function extractDosage(value = '') {
  const normalized = normalizeText(value).replace(/\s+/g, ' ');

  const match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(mg\/ml|mg|mcg|g|ui\/ml|ui|ml)/i);
  if (!match) {
    return { value: null, unit: null };
  }

  return {
    value: Number(match[1].replace(',', '.')),
    unit: match[2].toLowerCase(),
  };
}

function pickFirstIngredient(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)[0] || null;
}

function inferPerfBrand(row, productType) {
  const normalized = normalizeText(row.social_name || row.description);
  const tokens = normalized.split(' ').filter(Boolean);
  const ignored = new Set([
    'shampoo',
    'condicionador',
    'creme',
    'locao',
    'locoes',
    'hidratante',
    'esmalte',
    'protetor',
    'solar',
    'desodorante',
    'antitranspirante',
    'sabonete',
    'mascara',
    'kit',
    'capilar',
    'facial',
    'corporal',
    'finalizador',
    'limpeza',
    'gel',
    'oleo',
    'pre',
    'pos',
    'de',
    'para',
    'com',
    'sem',
    'e',
    'roll',
    'on',
  ]);

  if (productType) {
    for (const token of normalizeText(productType).split(' ')) {
      ignored.add(token);
    }
  }

  const token = tokens.find((item) => !ignored.has(item) && !/\d/.test(item) && item.length > 2);
  return token || null;
}

function buildMedicinePayload(row) {
  const details = safeJsonParse(row.details);
  const presentation =
    extractPresentationFromText(details?.forma_farmaceutica) ||
    extractPresentationFromText(details?.dose) ||
    extractPresentationFromText(row.description);

  const dosage =
    extractDosage(details?.dose) ||
    extractDosage(row.description);

  return {
    produto: row.social_name || row.description,
    apresentacao: presentation,
    dosagem_valor: dosage.value,
    dosagem_unidade: dosage.unit,
    quantidade: 1,
    marca: null,
    principio_ativo: pickFirstIngredient(row.active_ingredient),
    limit: 10,
  };
}

function buildPerfPayload(row) {
  const productType = PRODUCT_TYPE_BY_CLASSIFICATION.get(row.classification) || row.classification;
  const brand = inferPerfBrand(row, productType);

  return {
    produto: productType || row.social_name || row.description,
    apresentacao: extractPresentationFromText(row.description),
    dosagem_valor: null,
    dosagem_unidade: null,
    quantidade: 1,
    marca: brand,
    principio_ativo: null,
    limit: 10,
  };
}

function normalizeFamily(value = '') {
  return normalizeText(value)
    .replace(/\b(comprimidos?|capsulas?|capsula|solucao|gotas|spray|creme|pomada|xarope)\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?(?:mg\/ml|mg|mcg|g|ui|ml)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function familyMatches(target, result) {
  const targetFamily = normalizeFamily(target.social_name || target.description);
  const resultFamily = normalizeFamily(result.descricao);

  if (!targetFamily || !resultFamily) {
    return false;
  }

  return targetFamily.includes(resultFamily) || resultFamily.includes(targetFamily);
}

function topMatchIndex(results, predicate) {
  const index = results.findIndex(predicate);
  return index === -1 ? null : index;
}

function evaluateCase(testCase, results) {
  const exactIndex = topMatchIndex(results, (item) => item.ean === testCase.target.ean);
  const familyIndex = topMatchIndex(results, (item) => familyMatches(testCase.target, item));

  return {
    exactTop1: exactIndex === 0,
    exactTop3: exactIndex !== null && exactIndex < 3,
    exactTop10: exactIndex !== null && exactIndex < 10,
    familyTop1: familyIndex === 0,
    familyTop3: familyIndex !== null && familyIndex < 3,
    familyTop10: familyIndex !== null && familyIndex < 10,
  };
}

function summarize(groupName, results) {
  const total = results.length;

  const count = (field) => results.filter((item) => item.evaluation[field]).length;

  return {
    grupo: groupName,
    total,
    exactTop1: count('exactTop1'),
    exactTop3: count('exactTop3'),
    exactTop10: count('exactTop10'),
    familyTop1: count('familyTop1'),
    familyTop3: count('familyTop3'),
    familyTop10: count('familyTop10'),
    exactTop1Rate: Number(((count('exactTop1') / total) * 100).toFixed(2)),
    exactTop3Rate: Number(((count('exactTop3') / total) * 100).toFixed(2)),
    exactTop10Rate: Number(((count('exactTop10') / total) * 100).toFixed(2)),
    familyTop1Rate: Number(((count('familyTop1') / total) * 100).toFixed(2)),
    familyTop3Rate: Number(((count('familyTop3') / total) * 100).toFixed(2)),
    familyTop10Rate: Number(((count('familyTop10') / total) * 100).toFixed(2)),
  };
}

function groupRoundRobin(rows, builder, targetCount) {
  const groups = new Map();

  for (const row of rows) {
    if (!groups.has(row.classification)) {
      groups.set(row.classification, []);
    }

    groups.get(row.classification).push(row);
  }

  const selected = [];
  let changed = true;

  while (selected.length < targetCount && changed) {
    changed = false;

    for (const items of groups.values()) {
      if (items.length === 0 || selected.length >= targetCount) {
        continue;
      }

      const row = items.shift();
      const payload = builder(row);

      if (!payload?.produto) {
        continue;
      }

      selected.push({
        classification: row.classification,
        payload,
        target: row,
      });
      changed = true;
    }
  }

  return selected;
}

async function fetchMedicineRows() {
  const sql = `
    select ean, description, social_name, manufacturer, classification, active_ingredient, details
    from products
    where active_ingredient is not null
      and social_name is not null
      and classification is not null
      and classification <> 'outro'
    order by classification asc, md5(ean) asc
    limit 1200;
  `;

  const result = await query(sql);
  return result.rows;
}

async function fetchPerfRows() {
  const sql = `
    select ean, description, social_name, manufacturer, classification, active_ingredient, details
    from products
    where active_ingredient is null
      and classification = any($1::text[])
      and social_name is not null
    order by classification asc, md5(ean) asc
    limit 1200;
  `;

  const result = await query(sql, [PERF_CLASSIFICATIONS]);
  return result.rows;
}

async function runCases(cases, groupName) {
  const results = [];

  for (const testCase of cases) {
    const response = await searchProducts(testCase.payload);
    const evaluation = evaluateCase(testCase, response.produtos);

    results.push({
      grupo: groupName,
      classificacao: testCase.classification,
      payload: testCase.payload,
      target: {
        ean: testCase.target.ean,
        description: testCase.target.description,
        social_name: testCase.target.social_name,
        manufacturer: testCase.target.manufacturer,
        classification: testCase.target.classification,
      },
      evaluation,
      topResults: response.produtos.slice(0, 3).map((item) => ({
        ean: item.ean,
        descricao: item.descricao,
        score: item.score,
      })),
    });
  }

  return results;
}

async function main() {
  const medicineRows = await fetchMedicineRows();
  const perfRows = await fetchPerfRows();

  const medicineCases = groupRoundRobin(medicineRows, buildMedicinePayload, 50);
  const perfCases = groupRoundRobin(perfRows, buildPerfPayload, 50);

  const medicineResults = await runCases(medicineCases, 'medicamentos');
  const perfResults = await runCases(perfCases, 'perfumaria');

  const combined = [...medicineResults, ...perfResults];

  const summary = {
    generatedAt: new Date().toISOString(),
    medicineSummary: summarize('medicamentos', medicineResults),
    perfSummary: summarize('perfumaria', perfResults),
    overallSummary: summarize('geral', combined),
    failingExamples: combined
      .filter((item) => !item.evaluation.familyTop3)
      .slice(0, 20),
    exactMissExamples: combined
      .filter((item) => !item.evaluation.exactTop10)
      .slice(0, 20),
  };

  await writeFile(
    outputPath,
    JSON.stringify(
      {
        summary,
        medicineResults,
        perfResults,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nResultado completo salvo em ${outputPath}`);
}

main().catch((error) => {
  console.error('Falha ao executar benchmark:', error);
  process.exit(1);
});
