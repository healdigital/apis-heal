import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isLegifranceConfigured, getLegifranceToken } from '../utils/oauth.js';

const LEGIFRANCE_BASE =
  'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';

// Key legal codes for BTP
const CODES_BTP: Record<string, { id: string; label: string }> = {
  construction: {
    id: 'LEGITEXT000006074096',
    label: 'Code de la construction et de l\'habitation',
  },
  urbanisme: {
    id: 'LEGITEXT000006074075',
    label: "Code de l'urbanisme",
  },
  environnement: {
    id: 'LEGITEXT000006074220',
    label: "Code de l'environnement",
  },
  travail: {
    id: 'LEGITEXT000006072050',
    label: 'Code du travail',
  },
  marches_publics: {
    id: 'LEGITEXT000037701019',
    label: 'Code de la commande publique',
  },
};

async function legifranceFetch(
  endpoint: string,
  body: unknown,
): Promise<unknown> {
  const token = await getLegifranceToken();
  const url = `${LEGIFRANCE_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Légifrance API error ${response.status}: ${text}`);
  }

  return response.json();
}

export function registerLegifranceTools(server: McpServer): void {
  // 1. Recherche textes juridiques
  server.tool(
    'legifrance_search',
    "Recherche des textes juridiques français sur Légifrance: codes, lois, décrets, arrêtés. Utile pour la section 'Sécurité et environnement' et les références réglementaires du mémoire technique. REQUIERT des identifiants OAuth2 PISTE (LEGIFRANCE_CLIENT_ID et LEGIFRANCE_CLIENT_SECRET). Codes disponibles: construction, urbanisme, environnement, travail, marches_publics.",
    {
      recherche: z
        .string()
        .describe(
          "Texte à rechercher (ex: 'amiante travaux', 'échafaudage sécurité', 'déchets chantier')",
        ),
      code: z
        .enum([
          'construction',
          'urbanisme',
          'environnement',
          'travail',
          'marches_publics',
        ])
        .optional()
        .describe('Limiter la recherche à un code spécifique'),
      limite: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe('Nombre max de résultats (défaut: 10)'),
    },
    async ({ recherche, code, limite }) => {
      if (!isLegifranceConfigured()) {
        return {
          content: [
            {
              type: 'text' as const,
              text: "Légifrance non configuré. Ajoutez LEGIFRANCE_CLIENT_ID et LEGIFRANCE_CLIENT_SECRET (identifiants OAuth2 PISTE) dans les variables d'environnement. Inscription gratuite sur https://piste.gouv.fr",
            },
          ],
        };
      }

      try {
        const searchBody: Record<string, unknown> = {
          recherche: {
            champs: [
              {
                typeChamp: 'ALL',
                criteres: [
                  {
                    typeRecherche: 'EXACTE',
                    valeur: recherche,
                    operateur: 'ET',
                  },
                ],
                operateur: 'ET',
              },
            ],
            pageNumber: 1,
            pageSize: limite ?? 10,
          },
        };

        // If a specific code is selected, search within that code
        if (code && CODES_BTP[code]) {
          searchBody.fond = 'CODE_DATE';
          (searchBody.recherche as Record<string, unknown>).filtres = [
            {
              facette: 'TEXT_ID',
              valeurs: [CODES_BTP[code]!.id],
            },
          ];
        } else {
          searchBody.fond = 'ALL';
        }

        const data = await legifranceFetch('/search', searchBody);
        const results = data as {
          results?: Array<{
            titles?: Array<{ title?: string }>;
            sections?: Array<{ title?: string; articles?: Array<{ id?: string; num?: string; content?: string }> }>;
          }>;
          totalResultNumber?: number;
        };

        const lines = [
          `${results.totalResultNumber ?? 0} résultat(s) trouvé(s)${code ? ` dans ${CODES_BTP[code]!.label}` : ''}:\n`,
        ];

        if (results.results) {
          for (const result of results.results) {
            lines.push('---');
            if (result.titles) {
              for (const t of result.titles) {
                if (t.title) lines.push(`**${t.title}**`);
              }
            }
            if (result.sections) {
              for (const s of result.sections) {
                if (s.title) lines.push(`Section: ${s.title}`);
              }
            }
            lines.push('');
          }
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Légifrance: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. Article précis d'un code
  server.tool(
    'legifrance_article_code',
    "Récupère le contenu d'un article précis d'un code juridique français par son identifiant LEGIARTI. Permet de citer le texte exact dans le mémoire technique. REQUIERT des identifiants OAuth2 PISTE.",
    {
      article_id: z
        .string()
        .describe(
          "Identifiant LEGIARTI de l'article (ex: 'LEGIARTI000006896116')",
        ),
    },
    async ({ article_id }) => {
      if (!isLegifranceConfigured()) {
        return {
          content: [
            {
              type: 'text' as const,
              text: "Légifrance non configuré. Ajoutez LEGIFRANCE_CLIENT_ID et LEGIFRANCE_CLIENT_SECRET dans les variables d'environnement.",
            },
          ],
        };
      }

      try {
        const data = await legifranceFetch('/consult/getArticle', {
          id: article_id,
        });

        const article = data as {
          article?: {
            id?: string;
            num?: string;
            texte?: string;
            etat?: string;
            dateDebut?: number;
            dateFin?: number;
          };
        };

        if (!article.article) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Aucun article trouvé avec l'ID: ${article_id}`,
              },
            ],
          };
        }

        const a = article.article;
        const lines = [];
        if (a.num) lines.push(`# Article ${a.num}`);
        if (a.etat) lines.push(`État: ${a.etat}`);
        if (a.dateDebut)
          lines.push(
            `En vigueur depuis: ${new Date(a.dateDebut).toLocaleDateString('fr-FR')}`,
          );
        if (a.texte) {
          lines.push('');
          lines.push(a.texte);
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Légifrance: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
