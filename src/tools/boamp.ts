import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchJson } from '../utils/fetch.js';
import { logger } from '../utils/logger.js';
import { formatFields } from '../utils/formatters.js';

const BOAMP_BASE =
  'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp';

// Départements normands
const DEPARTEMENTS_NORMANDIE = ['14', '27', '50', '61', '76'];

interface BoampRecord {
  id: string;
  objet?: string;
  type_marche?: string;
  nature?: string;
  dateparution?: string;
  acheteur?: string;
  departement?: string;
  cpv?: string;
  url_avis?: string;
  montant?: string;
  lieu_execution?: string;
  date_limite?: string;
}

interface BoampResponse {
  total_count: number;
  results: Array<{ record?: BoampRecord } & BoampRecord>;
}

async function queryBoamp(params: {
  where?: string;
  q?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
}): Promise<BoampResponse> {
  const searchParams = new URLSearchParams();

  if (params.where) searchParams.set('where', params.where);
  if (params.q) searchParams.set('q', params.q);
  searchParams.set('limit', String(params.limit ?? 20));
  if (params.offset) searchParams.set('offset', String(params.offset));
  if (params.orderBy) searchParams.set('order_by', params.orderBy);

  const url = `${BOAMP_BASE}/records?${searchParams.toString()}`;

  logger.debug('Querying BOAMP API', { url, params });

  return fetchJson<BoampResponse>(url);
}

function formatBoampResults(data: BoampResponse): string {
  if (data.total_count === 0) {
    return 'Aucun marché trouvé pour ces critères.';
  }

  const lines = [`${data.total_count} marché(s) trouvé(s):\n`];

  for (const record of data.results) {
    const r = record.record ?? record;
    lines.push('---');
    lines.push(
      ...formatFields([
        { label: 'Objet', value: r.objet },
        { label: 'Type', value: r.type_marche },
        { label: 'Nature', value: r.nature },
        { label: 'Acheteur', value: r.acheteur },
        { label: 'Département', value: r.departement },
        { label: 'Date parution', value: r.dateparution },
        { label: 'Date limite', value: r.date_limite },
        { label: 'Montant', value: r.montant },
        { label: "Lieu d'exécution", value: r.lieu_execution },
        { label: 'CPV', value: r.cpv },
        { label: 'URL', value: r.url_avis },
        { label: 'ID', value: r.id },
      ]),
    );
    lines.push('');
  }

  return lines.join('\n');
}

export function registerBoampTools(server: McpServer): void {
  // 1. Recherche générale marchés publics
  server.tool(
    'boamp_search_marches',
    'Recherche les marchés publics sur le BOAMP (Bulletin Officiel des Annonces de Marchés Publics). Permet de filtrer par type de marché, département, texte libre, code CPV. Données mises à jour 2x/jour.',
    {
      recherche: z
        .string()
        .optional()
        .describe(
          "Texte libre pour rechercher dans les annonces (ex: 'gros oeuvre', 'construction école')",
        ),
      type_marche: z
        .enum(['Travaux', 'Fournitures', 'Services'])
        .optional()
        .describe('Type de marché'),
      departement: z
        .string()
        .optional()
        .describe("Code département (ex: '76' pour Seine-Maritime)"),
      cpv_prefix: z
        .string()
        .optional()
        .describe("Préfixe code CPV (ex: '45' pour travaux de construction)"),
      limite: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('Nombre max de résultats (défaut: 20)'),
    },
    async ({ recherche, type_marche, departement, cpv_prefix, limite }) => {
      try {
        const whereClauses: string[] = [];
        if (type_marche) whereClauses.push(`type_marche="${type_marche}"`);
        if (departement) whereClauses.push(`departement="${departement}"`);
        if (cpv_prefix) whereClauses.push(`cpv LIKE "${cpv_prefix}%"`);

        const data = await queryBoamp({
          where: whereClauses.length > 0 ? whereClauses.join(' AND ') : undefined,
          q: recherche,
          limit: limite ?? 20,
          orderBy: 'dateparution DESC',
        });

        logger.info('BOAMP search completed', {
          totalCount: data.total_count,
          resultsReturned: data.results.length,
        });

        return {
          content: [{ type: 'text' as const, text: formatBoampResults(data) }],
        };
      } catch (error) {
        logger.error('BOAMP search failed', error, { recherche, type_marche, departement });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur BOAMP: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. Détail d'un marché
  server.tool(
    'boamp_get_marche',
    "Récupère le détail complet d'une annonce de marché public par son identifiant BOAMP.",
    {
      id_annonce: z.string().describe("Identifiant de l'annonce BOAMP"),
    },
    async ({ id_annonce }) => {
      try {
        const data = await queryBoamp({
          where: `id="${id_annonce}"`,
          limit: 1,
        });

        if (data.total_count === 0) {
          logger.debug('BOAMP marché not found', { id_annonce });
          return {
            content: [
              {
                type: 'text' as const,
                text: `Aucune annonce trouvée avec l'ID: ${id_annonce}`,
              },
            ],
          };
        }

        const record = data.results[0];
        if (!record) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Aucune annonce trouvée avec l'ID: ${id_annonce}`,
              },
            ],
          };
        }

        logger.info('BOAMP marché retrieved', { id_annonce });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(record.record ?? record, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('BOAMP get marché failed', error, { id_annonce });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur BOAMP: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 3. Veille BTP Normandie
  server.tool(
    'boamp_veille_btp_normandie',
    "Raccourci: récupère les derniers marchés publics de Travaux en Normandie (départements 14, 27, 50, 61, 76). Idéal pour la veille appels d'offres d'AXL Constructions.",
    {
      jours: z
        .number()
        .min(1)
        .max(30)
        .optional()
        .describe('Nombre de jours en arrière (défaut: 7)'),
      recherche: z
        .string()
        .optional()
        .describe("Filtre texte supplémentaire (ex: 'gros oeuvre', 'béton', 'réhabilitation')"),
      limite: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('Nombre max de résultats (défaut: 30)'),
    },
    async ({ jours, recherche, limite }) => {
      try {
        const daysBack = jours ?? 7;
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - daysBack);
        const dateStr = dateFrom.toISOString().split('T')[0];
        if (!dateStr) {
          throw new Error('Failed to format date');
        }

        const deptFilter = DEPARTEMENTS_NORMANDIE.map((d) => `departement="${d}"`).join(' OR ');
        const where = `type_marche="Travaux" AND (${deptFilter}) AND dateparution>="${dateStr}"`;

        const data = await queryBoamp({
          where,
          q: recherche,
          limit: limite ?? 30,
          orderBy: 'dateparution DESC',
        });

        logger.info('BOAMP veille BTP Normandie completed', {
          daysBack,
          totalCount: data.total_count,
          resultsReturned: data.results.length,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Veille BTP Normandie (${daysBack} derniers jours):\n\n${formatBoampResults(data)}`,
            },
          ],
        };
      } catch (error) {
        logger.error('BOAMP veille BTP Normandie failed', error, { jours, recherche });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur BOAMP: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
