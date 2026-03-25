import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const BASE_CARBONE_URL = 'https://data.ademe.fr/data-fair/api/v1/datasets/base-carboner/lines';

interface BaseCarboneRecord {
  Nom_base_francais?: string;
  Nom_attribut_francais?: string;
  Total_poste_non_decompose?: number;
  Unite_francais?: string;
  CO2f?: number;
  CH4f?: number;
  N2O?: number;
  Source?: string;
  Localisation_geographique?: string;
  Type_Ligne?: string;
  Sous_categorie?: string;
  Categorie?: string;
  Code_de_la_categorie?: string;
  Statut_de_l_element?: string;
  Commentaire_francais?: string;
  Incertitude?: string;
}

interface BaseCarboneResponse {
  total: number;
  results: BaseCarboneRecord[];
}

async function queryBaseCarbone(params: {
  q?: string;
  qs?: string;
  size?: number;
  page?: number;
  select?: string;
}): Promise<BaseCarboneResponse> {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set('q', params.q);
  if (params.qs) searchParams.set('qs', params.qs);
  searchParams.set('size', String(params.size ?? 20));
  if (params.page) searchParams.set('page', String(params.page));
  if (params.select) searchParams.set('select', params.select);

  const url = `${BASE_CARBONE_URL}?${searchParams.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Base Carbone API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as BaseCarboneResponse;
}

function formatCarboneResults(data: BaseCarboneResponse): string {
  if (data.total === 0) {
    return "Aucun facteur d'émission trouvé.";
  }

  const lines = [
    `${data.total} facteur(s) d'émission trouvé(s) (affichage ${data.results.length}):\n`,
  ];

  for (const record of data.results) {
    lines.push('---');
    if (record.Nom_base_francais) lines.push(`Nom: ${record.Nom_base_francais}`);
    if (record.Nom_attribut_francais) lines.push(`Attribut: ${record.Nom_attribut_francais}`);
    if (record.Total_poste_non_decompose !== undefined)
      lines.push(
        `Émission totale: ${record.Total_poste_non_decompose} ${record.Unite_francais ?? 'kgCO2e'}`,
      );
    if (record.CO2f !== undefined) lines.push(`  CO2: ${record.CO2f}`);
    if (record.CH4f !== undefined) lines.push(`  CH4: ${record.CH4f}`);
    if (record.N2O !== undefined) lines.push(`  N2O: ${record.N2O}`);
    if (record.Categorie) lines.push(`Catégorie: ${record.Categorie}`);
    if (record.Sous_categorie) lines.push(`Sous-catégorie: ${record.Sous_categorie}`);
    if (record.Source) lines.push(`Source: ${record.Source}`);
    if (record.Localisation_geographique)
      lines.push(`Localisation: ${record.Localisation_geographique}`);
    if (record.Incertitude) lines.push(`Incertitude: ${record.Incertitude}`);
    if (record.Commentaire_francais) lines.push(`Note: ${record.Commentaire_francais}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function registerBaseCarboneTools(server: McpServer): void {
  // 1. Recherche matériaux BTP
  server.tool(
    'carbone_search_materiaux',
    "Recherche les facteurs d'émission carbone (kgCO2e) pour des matériaux de construction dans la Base Carbone ADEME. Couvre béton, acier, bois, ciment, isolants, etc. Utile pour la section 'Gestion des déchets et environnement' et le bilan carbone RE2020.",
    {
      materiau: z
        .string()
        .describe(
          "Nom du matériau à rechercher (ex: 'béton', 'acier construction', 'laine de verre', 'ciment CEM I')",
        ),
      categorie: z
        .string()
        .optional()
        .describe("Filtre par catégorie (ex: 'Construction', 'Matériaux de construction')"),
      limite: z.number().min(1).max(50).optional().describe('Nombre max de résultats (défaut: 10)'),
    },
    async ({ materiau, categorie, limite }) => {
      try {
        const qsFilters: string[] = [];
        if (categorie) {
          qsFilters.push(`Categorie:"${categorie}"`);
        }

        const data = await queryBaseCarbone({
          q: materiau,
          qs: qsFilters.length > 0 ? qsFilters.join(' AND ') : undefined,
          size: limite ?? 10,
        });

        return {
          content: [{ type: 'text' as const, text: formatCarboneResults(data) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Base Carbone: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. Facteur d'émission précis
  server.tool(
    'carbone_facteur_emission',
    "Retourne le facteur d'émission carbone détaillé (CO2, CH4, N2O) pour un matériau de construction spécifique. Recherche plus ciblée que carbone_search_materiaux. Idéal pour calculer l'empreinte carbone d'un poste de travaux.",
    {
      nom_exact: z
        .string()
        .describe("Nom précis du matériau ou produit (ex: 'Béton prêt à l\\'emploi C25/30')"),
    },
    async ({ nom_exact }) => {
      try {
        const data = await queryBaseCarbone({
          q: nom_exact,
          size: 5,
          select:
            'Nom_base_francais,Nom_attribut_francais,Total_poste_non_decompose,Unite_francais,CO2f,CH4f,N2O,Source,Incertitude,Commentaire_francais',
        });

        if (data.total === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Aucun facteur d'émission trouvé pour "${nom_exact}". Essayez avec carbone_search_materiaux pour une recherche plus large.`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text' as const, text: formatCarboneResults(data) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Base Carbone: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
