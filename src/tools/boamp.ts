import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `BOAMP API error: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as BoampResponse;
}

function formatBoampResults(data: BoampResponse): string {
  if (data.total_count === 0) {
    return 'Aucun marché trouvé pour ces critères.';
  }

  const lines = [`${data.total_count} marché(s) trouvé(s):\n`];

  for (const record of data.results) {
    const r = record.record ?? record;
    lines.push(`---`);
    if (r.objet) lines.push(`Objet: ${r.objet}`);
    if (r.type_marche) lines.push(`Type: ${r.type_marche}`);
    if (r.nature) lines.push(`Nature: ${r.nature}`);
    if (r.acheteur) lines.push(`Acheteur: ${r.acheteur}`);
    if (r.departement) lines.push(`Département: ${r.departement}`);
    if (r.dateparution) lines.push(`Date parution: ${r.dateparution}`);
    if (r.date_limite) lines.push(`Date limite: ${r.date_limite}`);
    if (r.montant) lines.push(`Montant: ${r.montant}`);
    if (r.lieu_execution)
      lines.push(`Lieu d'exécution: ${r.lieu_execution}`);
    if (r.cpv) lines.push(`CPV: ${r.cpv}`);
    if (r.url_avis) lines.push(`URL: ${r.url_avis}`);
    if (r.id) lines.push(`ID: ${r.id}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function registerBoampTools(server: McpServer): void {
  // 1. Recherche générale marchés publics
  server.tool(
    'boamp_search_marches',
    "Recherche les marchés publics sur le BOAMP (Bulletin Officiel des Annonces de Marchés Publics). Permet de filtrer par type de marché, département, texte libre, code CPV. Données mises à jour 2x/jour.",
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
        .describe(
          "Préfixe code CPV (ex: '45' pour travaux de construction)",
        ),
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
        if (type_marche)
          whereClauses.push(`type_marche="${type_marche}"`);
        if (departement)
          whereClauses.push(`departement="${departement}"`);
        if (cpv_prefix)
          whereClauses.push(`cpv LIKE "${cpv_prefix}%"`);

        const data = await queryBoamp({
          where: whereClauses.length > 0 ? whereClauses.join(' AND ') : undefined,
          q: recherche,
          limit: limite ?? 20,
          orderBy: 'dateparution DESC',
        });

        return {
          content: [{ type: 'text' as const, text: formatBoampResults(data) }],
        };
      } catch (error) {
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
      id_annonce: z
        .string()
        .describe("Identifiant de l'annonce BOAMP"),
    },
    async ({ id_annonce }) => {
      try {
        const data = await queryBoamp({
          where: `id="${id_annonce}"`,
          limit: 1,
        });

        if (data.total_count === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Aucune annonce trouvée avec l'ID: ${id_annonce}`,
              },
            ],
          };
        }

        const record = data.results[0]!;
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(record.record ?? record, null, 2),
            },
          ],
        };
      } catch (error) {
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
        .describe(
          "Filtre texte supplémentaire (ex: 'gros oeuvre', 'béton', 'réhabilitation')",
        ),
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
        const dateStr = dateFrom.toISOString().split('T')[0]!;

        const deptFilter = DEPARTEMENTS_NORMANDIE.map(
          (d) => `departement="${d}"`,
        ).join(' OR ');
        const where = `type_marche="Travaux" AND (${deptFilter}) AND dateparution>="${dateStr}"`;

        const data = await queryBoamp({
          where,
          q: recherche,
          limit: limite ?? 30,
          orderBy: 'dateparution DESC',
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
