import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { query } from '../src/config/database.js';
import { searchProducts } from '../src/services/productSearchService.js';
import { normalizeText } from '../src/utils/text.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const outputPath = join(projectRoot, 'benchmark-existing-products.json');

const PERF_CLASSIFICATIONS = [
  'Esmalte',
  'Hidratante',
  'Shampoo',
  'Sabonetes',
  'Tinturas',
  'Condicionador',
  'Protetor Solar',
  'Desodorante',
  'Mascara',
  'MÁSCARA',
  'Mã¡scara',
  'Kit Capilar',
  'Creme De Pentear',
  'Antirugas',
  'Acne',
  'Limpeza',
  'Finalizador',
  'perfumaria',
];

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
  if (normalized.includes('gel')) return 'gel';
  if (normalized.includes('spray')) return 'spray';
  if (
    normalized.includes('solucao') ||
    normalized.includes('suspensao') ||
    normalized.includes('po para suspensao')
  ) {
    return 'solucao';
  }

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

function pickBrand(row) {
  const candidates = [row.manufacturer, row.social_name, row.description]
    .filter(Boolean)
    .map((value) => String(value).trim());

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);

    if (!normalized || normalized.includes('nao definido')) {
      continue;
    }

    const token = candidate.split(/\s+/).find((item) => {
      const normalizedItem = normalizeText(item);
      return normalizedItem.length > 2 && !/\d/.test(normalizedItem);
    });

    if (token) {
      return token;
    }
  }

  return null;
}

function buildMedicinePayload(row) {
  const details = safeJsonParse(row.details);
  const dosage = extractDosage(details?.dose || row.description);
  const presentation =
    extractPresentationFromText(details?.forma_farmaceutica) ||
    extractPresentationFromText(details?.dose) ||
    extractPresentationFromText(row.description);

  return {
    produto: row.description || row.social_name,
    apresentacao: presentation,
    dosagem_valor: dosage.value,
    dosagem_unidade: dosage.unit,
    quantidade: 1,
    marca: null,
    principio_ativo: null,
    limit: 10,
  };
}

function buildPerfPayload(row) {
  return {
    produto: row.description || row.social_name,
    apresentacao: extractPresentationFromText(row.description),
    dosagem_valor: null,
    dosagem_unidade: null,
    quantidade: 1,
    marca: null,
    principio_ativo: null,
    limit: 10,
  };
}

function normalizeComparable(value = '') {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

function topMatchIndex(results, predicate) {
  const index = results.findIndex(predicate);
  return index === -1 ? null : index;
}

function evaluateCase(testCase, results) {
  const exactIndex = topMatchIndex(results, (item) => item.ean === testCase.target.ean);
  const textIndex = topMatchIndex(
    results,
    (item) => normalizeComparable(item.descricao) === normalizeComparable(testCase.target.description),
  );

  return {
    exactTop1: exactIndex === 0,
    exactTop3: exactIndex !== null && exactIndex < 3,
    exactTop10: exactIndex !== null && exactIndex < 10,
    sameDescriptionTop1: textIndex === 0,
    sameDescriptionTop3: textIndex !== null && textIndex < 3,
    sameDescriptionTop10: textIndex !== null && textIndex < 10,
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
    sameDescriptionTop1: count('sameDescriptionTop1'),
    sameDescriptionTop3: count('sameDescriptionTop3'),
    sameDescriptionTop10: count('sameDescriptionTop10'),
    exactTop1Rate: Number(((count('exactTop1') / total) * 100).toFixed(2)),
    exactTop3Rate: Number(((count('exactTop3') / total) * 100).toFixed(2)),
    exactTop10Rate: Number(((count('exactTop10') / total) * 100).toFixed(2)),
    sameDescriptionTop1Rate: Number(((count('sameDescriptionTop1') / total) * 100).toFixed(2)),
    sameDescriptionTop3Rate: Number(((count('sameDescriptionTop3') / total) * 100).toFixed(2)),
    sameDescriptionTop10Rate: Number(((count('sameDescriptionTop10') / total) * 100).toFixed(2)),
  };
}

function groupRoundRobin(rows, builder, targetCount) {
  const groups = new Map();

  for (const row of rows) {
    const key = row.classification || 'sem_classificacao';

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
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
      and description is not null
      and social_name is not null
      and classification is not null
      and classification <> 'outro'
    order by classification asc, md5(ean) asc
    limit 1500;
  `;

  const result = await query(sql);
  return result.rows;
}

async function fetchPerfRows() {
  const sql = `
    select ean, description, social_name, manufacturer, classification, active_ingredient, details
    from products
    where active_ingredient is null
      and description is not null
      and social_name is not null
      and classification = any($1::text[])
    order by classification asc, md5(ean) asc
    limit 1500;
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
      topResults: response.produtos.slice(0, 5).map((item) => ({
        ean: item.ean,
        descricao: item.descricao,
        score: item.score,
      })),
    });
  }

  return results;
}

function collectExamples(results, field, limit = 10) {
  return results
    .filter((item) => !item.evaluation[field])
    .slice(0, limit)
    .map((item) => ({
      classificacao: item.classificacao,
      target: item.target,
      payload: item.payload,
      topResults: item.topResults,
    }));
}

async function main() {
  const medicineRows = await fetchMedicineRows();
  const perfRows = await fetchPerfRows();

  const medicineCases = groupRoundRobin(medicineRows, buildMedicinePayload, 50);
  const perfCases = groupRoundRobin(perfRows, buildPerfPayload, 50);

  const medicineResults = await runCases(medicineCases, 'medicamentos_existentes');
  const perfResults = await runCases(perfCases, 'perfumaria_existente');
  const combined = [...medicineResults, ...perfResults];

  const summary = {
    generatedAt: new Date().toISOString(),
    scenario:
      'Consultas derivadas diretamente da descricao do item existente no banco, com apresentacao e dosagem extraidas quando disponiveis.',
    medicineSummary: summarize('medicamentos_existentes', medicineResults),
    perfSummary: summarize('perfumaria_existente', perfResults),
    overallSummary: summarize('geral_existentes', combined),
    exactMissExamples: {
      medicamentos: collectExamples(medicineResults, 'exactTop10'),
      perfumaria: collectExamples(perfResults, 'exactTop10'),
    },
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
  console.error('Falha ao executar benchmark de produtos existentes:', error);
  process.exit(1);
});
