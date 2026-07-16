import { sql } from 'drizzle-orm';
import { getClientDatabase } from '../config/clientDatabase.js';
import { logger } from '../config/logger.js';

export function normalizeEan(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '')
    .trim();
}

function toNumberOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

function buildClientProductMap(rows) {
  const map = new Map();

  for (const row of rows) {
    const normalizedEan = normalizeEan(row.ean);
    const precoVendaGeral = toNumberOrNull(row.preco_venda_geral);
    const precoVendaLoja = toNumberOrNull(row.preco_venda_loja);
    const precoFinalVenda = toNumberOrNull(row.preco_final_venda);
    const precoMelhorOferta = toNumberOrNull(row.preco_melhor_oferta);
    const precoMelhorOfertaComDesconto = toNumberOrNull(row.preco_melhor_oferta_com_desconto);
    const precoItemCadernoAtivo = toNumberOrNull(row.preco_item_caderno_ativo);
    const precoComDesconto = toNumberOrNull(row.preco_com_desconto);
    const leve = toNumberOrNull(row.leve);
    const pague = toNumberOrNull(row.pague);
    const precoBaseVenda = precoVendaLoja ?? precoVendaGeral;
    const melhorPreco =
      precoFinalVenda ??
      precoComDesconto ??
      precoMelhorOferta ??
      precoMelhorOfertaComDesconto ??
      precoItemCadernoAtivo ??
      precoBaseVenda;

    map.set(normalizedEan || row.ean, {
      ean: row.ean,
      estoque: Number(row.estoque || 0),
      preco_venda: precoBaseVenda,
      melhor_preco: melhorPreco,
      preco_melhor_oferta: precoMelhorOferta ?? precoMelhorOfertaComDesconto,
      preco_com_desconto: precoComDesconto ?? precoItemCadernoAtivo,
      preco_final_venda: precoFinalVenda ?? melhorPreco,
      preco_item_caderno_ativo: precoItemCadernoAtivo,
      leve,
      pague,
    });
  }

  return map;
}

function buildNormalizedEanExpression() {
  return sql`ltrim(regexp_replace(coalesce(emb.codigobarras, ''), '[^0-9]', '', 'g'), '0')`;
}

function buildNormalizedEanInClause(normalizedEans) {
  return sql.join(normalizedEans.map((ean) => sql`${ean}`), sql`, `);
}

export async function fetchClientProductsByEan(clientConfig, payload = {}) {
  const resolvedUnitId = payload.unidadeNegocioId ?? 1;

  const cleanEans = Array.from(new Set((payload.eans || []).filter(Boolean).map((ean) => String(ean).trim())));
  const normalizedEans = Array.from(new Set(cleanEans.map((ean) => normalizeEan(ean)).filter(Boolean)));
  const prioritizedCadernoOfertaId = payload.cadernoOfertaId ?? null;

  if (normalizedEans.length === 0) {
    return new Map();
  }

  const normalizedEanExpression = buildNormalizedEanExpression();
  const eanList = buildNormalizedEanInClause(normalizedEans);
  const db = getClientDatabase(clientConfig);

  logger.debug(
    {
      client: clientConfig.name ?? clientConfig.database,
      host: clientConfig.host,
      port: clientConfig.port,
      database: clientConfig.database,
      requestedUnitId: payload.unidadeNegocioId ?? null,
      resolvedUnitId,
      fallbackUnitApplied: payload.unidadeNegocioId == null,
      eans: cleanEans,
      normalizedEans,
    },
    'Executando consulta Alpha7 por EAN',
  );

  const query = sql`
    select
      emb.codigobarras as ean,
      coalesce(est.estoque, 0) as estoque,
      emb.precovenda as preco_venda_geral,
      peu.precovenda as preco_venda_loja,
      mo.precooferta as preco_melhor_oferta,
      mo.precounitariocomdesconto as preco_melhor_oferta_com_desconto,
      coalesce(
        ico_prioritario.precooferta,
        mo.precooferta,
        mo.precounitariocomdesconto,
        ico_melhor_oferta.precooferta,
        ico_ativo.precooferta
      ) as preco_com_desconto,
      coalesce(ico_prioritario.precooferta, ico_ativo.precooferta) as preco_item_caderno_ativo,
      coalesce(ico_prioritario.leve, ico_melhor_oferta.leve, ico_ativo.leve) as leve,
      coalesce(ico_prioritario.pague, ico_melhor_oferta.pague, ico_ativo.pague) as pague,
      case
        when ico_prioritario.precooferta is not null
        then ico_prioritario.precooferta
        when mo.precooferta is not null
          and (mo.vigenciatermino is null or mo.vigenciatermino >= now())
        then mo.precooferta
        when mo.precounitariocomdesconto is not null
          and (mo.vigenciatermino is null or mo.vigenciatermino >= now())
        then mo.precounitariocomdesconto
        when ico_melhor_oferta.precooferta is not null
        then ico_melhor_oferta.precooferta
        when ico_ativo.precooferta is not null
        then ico_ativo.precooferta
        when peu.precovenda is not null
        then peu.precovenda
        else emb.precovenda
      end as preco_final_venda
    from embalagem emb
    left join estoque est
      on est.embalagemid = emb.id
     and est.unidadenegocioid = ${resolvedUnitId}
    left join precoembalagemunidadenegocio peu
      on peu.embalagemid = emb.id
     and peu.unidadenegocioid = ${resolvedUnitId}
    left join melhoroferta mo
      on mo.embalagemid = emb.id
     and mo.unidadenegocioid = ${resolvedUnitId}
     and (mo.vigenciainicio is null or mo.vigenciainicio <= now())
     and (mo.vigenciatermino is null or mo.vigenciatermino >= now())
    left join lateral (
      select ico_mo.*
      from itemcadernooferta ico_mo
      join cadernooferta co_mo
        on co_mo.id = ico_mo.cadernoofertaid
      where mo.cadernoofertaid is not null
        and ico_mo.embalagemid = emb.id
        and ico_mo.cadernoofertaid = mo.cadernoofertaid
      order by
        case when ico_mo.precooferta is not null then 0 else 1 end,
        ico_mo.id desc
      limit 1
    ) ico_melhor_oferta on true
    left join lateral (
      select ico3.*
      from itemcadernooferta ico3
      join cadernooferta co3
        on co3.id = ico3.cadernoofertaid
      join unidadenegocioparticipantecadernooferta un3
        on un3.cadernoofertaid = co3.id
       and un3.unidadenegocioid = ${resolvedUnitId}
      where ${prioritizedCadernoOfertaId}::bigint is not null
        and ico3.embalagemid = emb.id
        and ico3.cadernoofertaid = ${prioritizedCadernoOfertaId}::bigint
        and co3.status = 'A'
        and co3.datahorainicial <= now()
        and (co3.datahorafinal is null or co3.datahorafinal >= now())
      order by
        case when ico3.precooferta is not null then 0 else 1 end,
        ico3.id desc
      limit 1
    ) ico_prioritario on true
    left join lateral (
      select ico2.*
      from itemcadernooferta ico2
      join cadernooferta co2
        on co2.id = ico2.cadernoofertaid
      join unidadenegocioparticipantecadernooferta un2
        on un2.cadernoofertaid = co2.id
       and un2.unidadenegocioid = ${resolvedUnitId}
      where ico2.embalagemid = emb.id
        and co2.status = 'A'
        and co2.datahorainicial <= now()
        and (co2.datahorafinal is null or co2.datahorafinal >= now())
      order by
        case when ico2.cadernoofertaid = ${prioritizedCadernoOfertaId}::bigint then 0 else 1 end,
        case when ico2.precooferta is not null then 0 else 1 end,
        co2.datahorafinal desc nulls last,
        ico2.id desc
      limit 1
    ) ico_ativo on true
    where ${normalizedEanExpression} in (${eanList})
    order by emb.codigobarras asc
  `;

  const result = await db.execute(query);
  const rows = result.rows ?? result;

  logger.debug(
    {
      client: clientConfig.name ?? clientConfig.database,
      resolvedUnitId,
      rowCount: rows.length,
      returnedEans: rows.map((row) => row.ean),
    },
    'Consulta Alpha7 concluida no banco do cliente',
  );

  return buildClientProductMap(rows);
}

export const _internals = {
  buildClientProductMap,
  normalizeEan,
};
