import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const GEORISQUES_BASE = 'https://www.georisques.gouv.fr/api/v1';

async function fetchGeorisques(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const searchParams = new URLSearchParams(params);
  const url = `${GEORISQUES_BASE}${endpoint}?${searchParams.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Géorisques API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function formatRiskReport(data: unknown): string {
  const d = data as Record<string, unknown>;
  const sections: string[] = [];

  sections.push('# Rapport des risques du site\n');

  // Try to extract structured data from various response formats
  if (Array.isArray(d.data)) {
    for (const item of d.data as Array<Record<string, unknown>>) {
      if (item.libelle_risque || item.libelle) {
        sections.push(
          `- **${(item.libelle_risque ?? item.libelle) as string}**: ${(item.niveau ?? item.alea ?? 'Identifié') as string}`,
        );
      }
    }
  }

  if (sections.length === 1) {
    sections.push(JSON.stringify(data, null, 2));
  }

  return sections.join('\n');
}

export function registerGeorisquesTools(server: McpServer): void {
  // 1. Rapport complet des risques
  server.tool(
    'georisques_rapport_risques',
    "Génère un rapport complet des risques naturels et technologiques pour un site donné (par coordonnées GPS). Couvre: inondation, mouvement de terrain, séisme, cavités, sols pollués, ICPE, catastrophes naturelles. Essentiel pour la section 'Contexte du site' du mémoire technique.",
    {
      latitude: z.number().describe('Latitude du site (ex: 49.4432)'),
      longitude: z.number().describe('Longitude du site (ex: 1.0999)'),
      rayon: z.number().optional().describe('Rayon de recherche en mètres (défaut: 1000)'),
    },
    async ({ latitude, longitude, rayon }) => {
      try {
        const latlon = `${latitude},${longitude}`;
        const r = String(rayon ?? 1000);

        // Fetch multiple risk categories in parallel
        const [risquesRapport, cavites, mouvements, ssp, catnat] = await Promise.allSettled([
          fetchGeorisques('/resultats_rapport_risque', { latlon }),
          fetchGeorisques('/cavites', { latlon, rayon: r }),
          fetchGeorisques('/mvt', { latlon, rayon: r }),
          fetchGeorisques('/ssp', { latlon, rayon: r }),
          fetchGeorisques('/gaspar/catnat', {
            latlon,
            rayon: r,
          }),
        ]);

        const report: string[] = [
          `# Rapport des risques — ${latitude}, ${longitude} (rayon ${rayon ?? 1000}m)\n`,
        ];

        // Main risk report
        if (risquesRapport.status === 'fulfilled') {
          report.push('## Risques identifiés');
          report.push(formatRiskReport(risquesRapport.value));
          report.push('');
        }

        // Cavities
        if (cavites.status === 'fulfilled') {
          const c = cavites.value as { data?: unknown[]; total_count?: number };
          const count = c.data?.length ?? c.total_count ?? 0;
          report.push(`## Cavités souterraines: ${count} trouvée(s)`);
          if (count > 0) {
            report.push(JSON.stringify(c.data?.slice(0, 5), null, 2));
          }
          report.push('');
        }

        // Ground movements
        if (mouvements.status === 'fulfilled') {
          const m = mouvements.value as {
            data?: unknown[];
            total_count?: number;
          };
          const count = m.data?.length ?? m.total_count ?? 0;
          report.push(`## Mouvements de terrain: ${count} enregistré(s)`);
          if (count > 0) {
            report.push(JSON.stringify(m.data?.slice(0, 5), null, 2));
          }
          report.push('');
        }

        // Polluted sites
        if (ssp.status === 'fulfilled') {
          const s = ssp.value as { data?: unknown[]; total_count?: number };
          const count = s.data?.length ?? s.total_count ?? 0;
          report.push(`## Sites pollués (SSP): ${count} trouvé(s)`);
          if (count > 0) {
            report.push(JSON.stringify(s.data?.slice(0, 5), null, 2));
          }
          report.push('');
        }

        // Natural disasters history
        if (catnat.status === 'fulfilled') {
          const cn = catnat.value as {
            data?: unknown[];
            total_count?: number;
          };
          const count = cn.data?.length ?? cn.total_count ?? 0;
          report.push(`## Arrêtés de catastrophe naturelle: ${count} enregistré(s)`);
          if (count > 0) {
            report.push(JSON.stringify(cn.data?.slice(0, 10), null, 2));
          }
          report.push('');
        }

        return {
          content: [{ type: 'text' as const, text: report.join('\n') }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Géorisques: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. Classification sismique
  server.tool(
    'georisques_seisme',
    "Retourne la classification sismique d'une commune par code INSEE. Zones: 1 (très faible) à 5 (forte). Important pour le dimensionnement structurel dans le mémoire technique.",
    {
      code_insee: z.string().describe("Code INSEE de la commune (ex: '76540' pour Rouen)"),
    },
    async ({ code_insee }) => {
      try {
        const data = await fetchGeorisques('/zonage_sismique', {
          code_insee,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Géorisques sismique: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 3. Retrait-gonflement argiles
  server.tool(
    'georisques_argiles',
    'Évalue le risque de retrait-gonflement des argiles à un point GPS. Niveaux: faible, moyen, fort. Critique pour le choix des fondations (semelles, radier, pieux) dans le mémoire technique.',
    {
      latitude: z.number().describe('Latitude du site'),
      longitude: z.number().describe('Longitude du site'),
    },
    async ({ latitude, longitude }) => {
      try {
        const data = await fetchGeorisques('/rga', {
          latlon: `${latitude},${longitude}`,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Géorisques argiles: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 4. Cavités souterraines
  server.tool(
    'georisques_cavites',
    "Recherche les cavités souterraines (carrières, caves, ouvrages civils, naturelles) dans un rayon autour d'un point GPS. Essentiel pour l'étude géotechnique et le choix des fondations.",
    {
      latitude: z.number().describe('Latitude du site'),
      longitude: z.number().describe('Longitude du site'),
      rayon: z.number().optional().describe('Rayon de recherche en mètres (défaut: 500)'),
    },
    async ({ latitude, longitude, rayon }) => {
      try {
        const data = await fetchGeorisques('/cavites', {
          latlon: `${latitude},${longitude}`,
          rayon: String(rayon ?? 500),
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur Géorisques cavités: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
