import { normalizeEan } from './tenantCatalogStore.js';
import { consultTenantCatalogByEans } from './tenantCatalogQueryService.js';
import { fetchClientProductsByEan } from './clientProductService.js';
import { fetchAutomatizaProductsByEan } from './automatizaProductService.js';
import { fetchVetorProductsByEan } from './vetorApiClient.js';
import { logger } from '../config/logger.js';

function dedupeEansPreservingOrder(eans = []) {
  const seen = new Set();
  const ordered = [];

  for (const ean of eans) {
    const normalized = normalizeEan(ean);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    ordered.push({
      original: String(ean).trim(),
      normalized,
    });
  }

  return ordered;
}

function buildAlpha7Discounts(product) {
  const melhorDesconto = Number(product.melhor_preco);
  const valorVenda = Number(product.preco_venda);

  if (!Number.isFinite(melhorDesconto)) {
    return [];
  }

  if (!Number.isFinite(valorVenda) && !Number.isFinite(product.leve) && !Number.isFinite(product.pague)) {
    return [];
  }

  if (Number.isFinite(valorVenda) && melhorDesconto >= valorVenda && !Number.isFinite(product.leve) && !Number.isFinite(product.pague)) {
    return [];
  }

  return [
    {
      tipo: Number.isFinite(product.leve) && Number.isFinite(product.pague) ? 'leve-pague' : 'melhor',
      chave: `alpha7:${normalizeEan(product.ean) || product.ean}`,
      produtoCodigo: null,
      ean: product.ean,
      nomeProduto: null,
      dataInicio: null,
      dataFim: null,
      valorReferencia: melhorDesconto,
    },
  ];
}

function buildVetorDiscounts(product) {
  if (!Number.isFinite(product.vlrOferta) || !Number.isFinite(product.vlrTabela)) {
    return [];
  }

  if (product.vlrOferta >= product.vlrTabela) {
    return [];
  }

  return [
    {
      tipo: 'melhor',
      chave: `vetor:${normalizeEan(product.ean) || product.ean}`,
      produtoCodigo: null,
      ean: product.ean,
      nomeProduto: product.nome,
      dataInicio: null,
      dataFim: null,
      valorReferencia: product.vlrOferta,
    },
  ];
}

function mapVetorProducts(orderedEans, productsByEan) {
  return orderedEans
    .map((item) => {
      const product = productsByEan.get(item.normalized);

      if (!product) {
        return null;
      }

      return {
        ean: product.ean,
        codigoProduto: null,
        nome: product.nome,
        valorVenda: product.vlrTabela,
        estoque: product.estoque,
        ativo: product.ativo,
        melhorDesconto: product.vlrOferta ?? product.vlrTabela,
        descontos: buildVetorDiscounts(product),
        leve: null,
        pague: null,
      };
    })
    .filter(Boolean);
}

function mapAlpha7Products(orderedEans, productsByEan) {
  return orderedEans
    .map((item) => {
      const product = productsByEan.get(item.normalized);

      if (!product) {
        return null;
      }

      const descontos = buildAlpha7Discounts(product);
      const valorVenda = Number.isFinite(Number(product.preco_venda)) ? Number(product.preco_venda) : null;
      const melhorDesconto = Number.isFinite(Number(product.melhor_preco))
        ? Number(product.melhor_preco)
        : valorVenda;

      return {
        ean: product.ean,
        codigoProduto: null,
        nome: null,
        valorVenda,
        estoque: Number.isFinite(Number(product.estoque)) ? Number(product.estoque) : 0,
        ativo: true,
        melhorDesconto,
        descontos,
        leve: Number.isFinite(Number(product.leve)) ? Number(product.leve) : null,
        pague: Number.isFinite(Number(product.pague)) ? Number(product.pague) : null,
      };
    })
    .filter(Boolean);
}

function buildAutomatizaDiscounts(product) {
  if (!Number.isFinite(product.price_promo) || !Number.isFinite(product.price)) {
    return [];
  }

  if (product.price_promo >= product.price) {
    return [];
  }

  return [
    {
      tipo: 'melhor',
      chave: `automatiza:${normalizeEan(product.ean) || product.ean}:${product.shop_id}`,
      produtoCodigo: product.product_id,
      ean: product.ean,
      nomeProduto: product.title,
      dataInicio: null,
      dataFim: null,
      valorReferencia: product.price_promo,
    },
  ];
}

function mapAutomatizaProducts(orderedEans, productsByEan) {
  return orderedEans
    .map((item) => {
      const product = productsByEan.get(item.normalized);

      if (!product) {
        return null;
      }

      const descontos = buildAutomatizaDiscounts(product);
      const valorVenda = Number.isFinite(product.price) ? product.price : null;
      const melhorDesconto = Number.isFinite(product.melhor_preco) ? product.melhor_preco : valorVenda;

      return {
        ean: product.ean,
        codigoProduto: product.product_id,
        nome: product.title,
        descricao: product.description,
        valorVenda,
        estoque: product.quantity,
        ativo: product.quantity > 0,
        melhorDesconto,
        descontos,
        leve: null,
        pague: null,
        categoria: product.category,
        grupo: product.group,
        subgrupo: product.subgroup,
        marca: product.brand,
        imagem: product.image_link,
        ncm: product.ncm,
        laboratorio: product.laboratorio,
        generico: product.drug_is_generic,
        retencaoReceita: product.retencaoreceita,
      };
    })
    .filter(Boolean);
}

export async function consultProductsByEan(clientConfig, payload = {}) {
  const orderedEans = dedupeEansPreservingOrder(payload.eans || []);

  logger.debug(
    {
      client: clientConfig.name ?? clientConfig.database,
      provider: clientConfig.provider ?? 'trier',
      host: clientConfig.host,
      port: clientConfig.port,
      database: clientConfig.database,
      unidadeNegocioId: payload.unidadeNegocioId ?? null,
      eanCount: orderedEans.length,
    },
    'Iniciando consulta de EANs',
  );

  const start = Date.now();
  let result;

  if (clientConfig.provider === 'alpha7') {
    const productsByEan = await fetchClientProductsByEan(clientConfig, {
      ...payload,
      eans: orderedEans.map((item) => item.original),
    });

    result = {
      produtos: mapAlpha7Products(orderedEans, productsByEan),
    };
  } else if (clientConfig.provider === 'automatiza') {
    const productsByEan = await fetchAutomatizaProductsByEan(
      clientConfig,
      {
        ...payload,
        eans: orderedEans.map((item) => item.original),
      },
    );

    result = {
      produtos: mapAutomatizaProducts(orderedEans, productsByEan),
    };
  } else if (clientConfig.provider === 'vetor') {
    const productsByEan = await fetchVetorProductsByEan(
      clientConfig,
      orderedEans.map((item) => item.original),
    );

    result = {
      produtos: mapVetorProducts(orderedEans, productsByEan),
    };
  } else {
    result = await consultTenantCatalogByEans(
      clientConfig,
      orderedEans.map((item) => item.original),
    );
  }

  logger.info(
    {
      client: clientConfig.name ?? clientConfig.database,
      provider: clientConfig.provider ?? 'trier',
      eansSolicitados: orderedEans.length,
      produtosEncontrados: result.produtos.length,
      ms: Date.now() - start,
    },
    'Consulta de EANs concluida',
  );

  return result;
}

export const _internals = {
  buildAlpha7Discounts,
  buildAutomatizaDiscounts,
  buildVetorDiscounts,
  dedupeEansPreservingOrder,
  mapAlpha7Products,
  mapAutomatizaProducts,
  mapVetorProducts,
};
