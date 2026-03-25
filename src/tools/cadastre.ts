import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const CADASTRE_BASE = 'https://apicarto.ign.fr/api/cadastre';

async function fetchCadastre(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const searchParams = new URLSearchParams(params);
  const url = `${CADASTRE_BASE}${endpoint}?${searchParams.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API Cadastre error ${response.status}: ${text}`);
  }

  return response.json();
}

function formatParcelleResult(data: unknown): string {
  const geo = data as {
    type: string;
    features: Array<{
      properties: {
        numero?: string;
        section?: string;
        code_dep?: string;
        code_com?: string;
        com_abs?: string;
        contenance?: number;
        code_arr?: string;
      };
      geometry: unknown;
    }>;
  };

  if (!geo.features || geo.features.length === 0) {
    return 'Aucune parcelle trouvée.';
  }

  const lines = [`${geo.features.length} parcelle(s) trouvée(s):\n`];

  for (const feature of geo.features) {
    const p = feature.properties;
    lines.push('---');
    lines.push(
      `Parcelle: ${p.code_dep ?? ''}${p.code_com ?? ''} ${p.section ?? ''} ${p.numero ?? ''}`,
    );
    if (p.contenance) lines.push(`Surface: ${p.contenance} m²`);
    if (p.code_dep) lines.push(`Département: ${p.code_dep}`);
    if (p.code_com) lines.push(`Commune: ${p.code_com}`);
    if (feature.geometry) {
      lines.push(`Géométrie: ${(feature.geometry as { type: string }).type}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function registerCadastreTools(server: McpServer): void {
  // 1. Parcelle par référence cadastrale
  server.tool(
    'cadastre_parcelle',
    "Récupère une parcelle cadastrale par sa référence (code INSEE + section + numéro). Retourne la géométrie, la surface et les identifiants. Utile pour la section 'Contexte du site' du mémoire technique.",
    {
      code_insee: z
        .string()
        .describe(
          "Code INSEE de la commune (ex: '76540' pour Rouen). Utiliser geocoder_adresse pour l'obtenir.",
        ),
      section: z.string().optional().describe("Section cadastrale (ex: 'AB', 'AC')"),
      numero: z.string().optional().describe("Numéro de parcelle (ex: '0123')"),
    },
    async ({ code_insee, section, numero }) => {
      try {
        const params: Record<string, string> = {
          code_insee,
          source_ign: 'PCI',
        };
        if (section) params.section = section;
        if (numero) params.numero = numero;

        const data = await fetchCadastre('/parcelle', params);
        return {
          content: [{ type: 'text' as const, text: formatParcelleResult(data) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Cadastre: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. Parcelle par coordonnées
  server.tool(
    'cadastre_parcelle_coords',
    'Identifie la parcelle cadastrale à un point géographique (latitude/longitude). Retourne la référence cadastrale, surface et géométrie. Utiliser geocoder_adresse au préalable pour convertir une adresse en coordonnées.',
    {
      latitude: z.number().describe('Latitude du point'),
      longitude: z.number().describe('Longitude du point'),
    },
    async ({ latitude, longitude }) => {
      try {
        // API Carto expects a GeoJSON geometry in the geom parameter
        const geom = JSON.stringify({
          type: 'Point',
          coordinates: [longitude, latitude],
        });

        const data = await fetchCadastre('/parcelle', {
          geom,
          source_ign: 'PCI',
        });
        return {
          content: [{ type: 'text' as const, text: formatParcelleResult(data) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Cadastre: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
