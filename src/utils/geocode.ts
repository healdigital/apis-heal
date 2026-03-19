import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const BAN_BASE_URL = 'https://api-adresse.data.gouv.fr';

export interface GeocodedAddress {
  label: string;
  latitude: number;
  longitude: number;
  code_insee: string;
  code_postal: string;
  commune: string;
  departement: string;
  score: number;
}

export async function geocodeAddress(
  address: string,
): Promise<GeocodedAddress | null> {
  const url = `${BAN_BASE_URL}/search/?q=${encodeURIComponent(address)}&limit=1`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`BAN API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    features: Array<{
      geometry: { coordinates: [number, number] };
      properties: {
        label: string;
        score: number;
        citycode: string;
        postcode: string;
        city: string;
        context: string;
      };
    }>;
  };

  if (!data.features || data.features.length === 0) {
    return null;
  }

  const feature = data.features[0]!;
  const contextParts = feature.properties.context.split(', ');

  return {
    label: feature.properties.label,
    longitude: feature.geometry.coordinates[0]!,
    latitude: feature.geometry.coordinates[1]!,
    code_insee: feature.properties.citycode,
    code_postal: feature.properties.postcode,
    commune: feature.properties.city,
    departement: contextParts[0] || '',
    score: feature.properties.score,
  };
}

export function registerGeocodeTools(server: McpServer): void {
  server.tool(
    'geocoder_adresse',
    "Convertit une adresse postale française en coordonnées GPS (latitude/longitude) et code INSEE. Utilise la Base Adresse Nationale (BAN). Indispensable pour alimenter les outils Géorisques, Cadastre et Urbanisme.",
    {
      adresse: z
        .string()
        .describe(
          "Adresse postale complète (ex: '15 rue de la Paix, 76000 Rouen')",
        ),
    },
    async ({ adresse }) => {
      try {
        const result = await geocodeAddress(adresse);
        if (!result) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Aucun résultat trouvé pour l'adresse: "${adresse}"`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur géocodage: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
