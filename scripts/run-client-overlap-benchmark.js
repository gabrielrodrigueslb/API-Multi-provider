import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { searchProducts } from '../src/services/productSearchService.js';
import { normalizeText } from '../src/utils/text.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);
const outputPath = join(projectRoot, 'benchmark-client-overlap.json');

const clientConfig = {
  name: 'complexo_loja06',
  host: '127.0.0.1',
  port: 55433,
  database: 'complexofarma_loja06',
  user: 'unico_contato_bd',
  password: '97Ghc1PUHHDA',
  ssl: false,
  unidadeNegocioId: 74579,
  minStock: 0,
};

function safeJsonParse(value) {
  if (!value) return null;
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

function buildPayload(row) {
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
    marca: null,
    principio_ativo: null,
    limit: 10,
    client_database: clientConfig,
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
    exactTop1Rate: Number(((count('exactTop1') / total) * 100).toFixed(2)),
    exactTop3Rate: Number(((count('exactTop3') / total) * 100).toFixed(2)),
    exactTop10Rate: Number(((count('exactTop10') / total) * 100).toFixed(2)),
  };
}

function evaluateCase(testCase, results) {
  const exactIndex = results.findIndex((item) => item.ean === testCase.target.ean);
  return {
    exactTop1: exactIndex === 0,
    exactTop3: exactIndex !== -1 && exactIndex < 3,
    exactTop10: exactIndex !== -1 && exactIndex < 10,
  };
}

function groupRoundRobin(rows, targetCount) {
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
      selected.push({
        classification: row.classification,
        payload: buildPayload(row),
        target: row,
      });
      changed = true;
    }
  }

  return selected;
}

async function fetchOverlapRows() {
  const { Client } = pg;
  const client = new Client({
    host: clientConfig.host,
    port: clientConfig.port,
    database: clientConfig.database,
    user: clientConfig.user,
    password: clientConfig.password,
    ssl: false,
  });

  await client.connect();
  const result = await client.query(`
    with loja as (
      select
        ltrim(regexp_replace(coalesce(emb.codigobarras, ''), '[^0-9]', '', 'g'), '0') as ean_normalizado,
        emb.codigobarras as ean_cliente,
        emb.descricao as descricao_cliente,
        est.estoque
      from embalagem emb
      join estoque est
        on est.embalagemid = emb.id
       and est.unidadenegocioid = 74579
      where coalesce(est.estoque, 0) > 0
        and emb.codigobarras is not null
    )
    select
      p.ean,
      p.description,
      p.social_name,
      p.classification,
      p.active_ingredient,
      p.details,
      l.descricao_cliente,
      l.estoque
    from loja l
    join dblink(
      'dbname=banco_unico'
    ) as ignored(dummy text) on true
  `).catch(async () => {
    await client.end();
    return null;
  });
  await client.end();
  return result;
}

async function fetchOverlapRowsFromLocalJoins() {
  const { query } = await import('../src/config/database.js');
  const localCatalog = await query(`
    select
      ean,
      description,
      social_name,
      classification,
      active_ingredient,
      details
    from products
    where ean is not null
  `);

  const { Client } = pg;
  const client = new Client({
    host: clientConfig.host,
    port: clientConfig.port,
    database: clientConfig.database,
    user: clientConfig.user,
    password: clientConfig.password,
    ssl: false,
  });
  await client.connect();
  const loja = await client.query(`
    select
      ltrim(regexp_replace(coalesce(emb.codigobarras, ''), '[^0-9]', '', 'g'), '0') as ean_normalizado,
      emb.codigobarras as ean_cliente,
      emb.descricao as descricao_cliente,
      est.estoque
    from embalagem emb
    join estoque est
      on est.embalagemid = emb.id
     and est.unidadenegocioid = 74579
    where coalesce(est.estoque, 0) > 0
      and emb.codigobarras is not null
  `);
  await client.end();

  const catalogByEan = new Map(
    localCatalog.rows.map((row) => [
      String(row.ean).replace(/\D/g, '').replace(/^0+/, ''),
      row,
    ]),
  );

  return loja.rows
    .map((row) => {
      const catalogRow = catalogByEan.get(row.ean_normalizado);
      if (!catalogRow) {
        return null;
      }
      return {
        ...catalogRow,
        descricao_cliente: row.descricao_cliente,
        estoque: Number(row.estoque),
      };
    })
    .filter(Boolean);
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
        classification: testCase.target.classification,
      },
      evaluation,
      topResults: response.produtos.slice(0, 5).map((item) => ({
        ean: item.ean,
        descricao: item.descricao,
        estoque: item.estoque_disponivel,
        score: item.score,
      })),
    });
  }

  return results;
}

async function main() {
  const overlapRows = await fetchOverlapRowsFromLocalJoins();
  const medicineRows = overlapRows.filter((row) => row.active_ingredient);
  const perfRows = overlapRows.filter((row) => !row.active_ingredient);

  const medicineCases = groupRoundRobin(medicineRows, 50);
  const perfCases = groupRoundRobin(perfRows, 50);

  const medicineResults = await runCases(medicineCases, 'cliente_medicamentos');
  const perfResults = await runCases(perfCases, 'cliente_perfumaria');

  const summary = {
    generatedAt: new Date().toISOString(),
    medicineSummary: summarize('cliente_medicamentos', medicineResults),
    perfSummary: summarize('cliente_perfumaria', perfResults),
    overallSummary: summarize('cliente_geral', [...medicineResults, ...perfResults]),
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
  console.error('Falha ao executar benchmark com overlap do cliente:', error);
  process.exit(1);
});
