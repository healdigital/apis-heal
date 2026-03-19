import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const GPU_BASE = 'https://apicarto.ign.fr/api/gpu';

async function fetchGPU(
  endpoint: string,
  params: Record<string, string>,
): Promise<unknown> {
  const searchParams = new URLSearchParams(params);
  const url = `${GPU_BASE}${endpoint}?${searchParams.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API GPU error ${response.status}: ${text}`);
  }

  return response.json();
}

function makePointGeom(longitude: number, latitude: number): string {
  return JSON.stringify({
    type: 'Point',
    coordinates: [longitude, latitude],
  });
}

function formatZonageResult(data: unknown): string {
  const geo = data as {
    features: Array<{
      properties: {
        libelle?: string;
        libelong?: string;
        typezone?: string;
        destdomi?: string;
        nomfic?: string;
        urlfic?: string;
        partition?: string;
        idurba?: string;
      };
    }>;
  };

  if (!geo.features || geo.features.length === 0) {
    return "Aucun zonage PLU trouvé pour ce point. La commune n'a peut-être pas de PLU numérisé sur le Géoportail de l'urbanisme.";
  }

  const lines = [`${geo.features.length} zone(s) trouvée(s):\n`];

  for (const feature of geo.features) {
    const p = feature.properties;
    lines.push('---');
    if (p.libelle) lines.push(`Zone: ${p.libelle}`);
    if (p.libelong) lines.push(`Description: ${p.libelong}`);
    if (p.typezone) {
      const typeLabels: Record<string, string> = {
        U: 'Urbaine (constructible)',
        AU: 'À Urbaniser',
        A: 'Agricole',
        N: 'Naturelle',
      };
      lines.push(
        `Type: ${p.typezone} — ${typeLabels[p.typezone] ?? 'Autre'}`,
      );
    }
    if (p.destdomi) lines.push(`Destination dominante: ${p.destdomi}`);
    if (p.idurba) lines.push(`Document d'urbanisme: ${p.idurba}`);
    if (p.nomfic) lines.push(`Règlement: ${p.nomfic}`);
    if (p.urlfic) lines.push(`URL règlement: ${p.urlfic}`);
    lines.push('');
  }

  return lines.join('\n');
}

function formatServitudesResult(data: unknown): string {
  const geo = data as {
    features: Array<{
      properties: {
        libelle?: string;
        libelong?: string;
        nomfic?: string;
        urlfic?: string;
        idurba?: string;
        txt?: string;
      };
    }>;
  };

  if (!geo.features || geo.features.length === 0) {
    return 'Aucune servitude trouvée pour ce point.';
  }

  const lines = [`${geo.features.length} servitude(s) trouvée(s):\n`];

  for (const feature of geo.features) {
    const p = feature.properties;
    lines.push('---');
    if (p.libelle) lines.push(`Servitude: ${p.libelle}`);
    if (p.libelong) lines.push(`Description: ${p.libelong}`);
    if (p.txt) lines.push(`Texte: ${p.txt}`);
    if (p.nomfic) lines.push(`Document: ${p.nomfic}`);
    if (p.urlfic) lines.push(`URL: ${p.urlfic}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function registerUrbanismeTools(server: McpServer): void {
  // 1. Zonage PLU
  server.tool(
    'urbanisme_zonage_plu',
    "Identifie le zonage PLU/PLUi (Plan Local d'Urbanisme) à un point GPS. Retourne le type de zone (U=Urbaine, AU=À Urbaniser, A=Agricole, N=Naturelle), la destination dominante et le lien vers le règlement. Essentiel pour vérifier la constructibilité du terrain dans le mémoire technique.",
    {
      latitude: z.number().describe('Latitude du site'),
      longitude: z.number().describe('Longitude du site'),
    },
    async ({ latitude, longitude }) => {
      try {
        const geom = makePointGeom(longitude, latitude);

        // Fetch zone-urba and document info in parallel
        const [zonage, document] = await Promise.allSettled([
          fetchGPU('/zone-urba', { geom }),
          fetchGPU('/document', { geom }),
        ]);

        const sections: string[] = [
          `# Zonage PLU — ${latitude}, ${longitude}\n`,
        ];

        if (zonage.status === 'fulfilled') {
          sections.push('## Zones');
          sections.push(formatZonageResult(zonage.value));
        } else {
          sections.push(
            `## Zones\nErreur: ${zonage.reason}`,
          );
        }

        if (document.status === 'fulfilled') {
          const docData = document.value as {
            features: Array<{
              properties: {
                idurba?: string;
                typedoc?: string;
                etat?: string;
                datappro?: string;
                nom?: string;
              };
            }>;
          };
          if (docData.features?.length > 0) {
            sections.push("\n## Document d'urbanisme");
            for (const f of docData.features) {
              const p = f.properties;
              if (p.typedoc) sections.push(`Type: ${p.typedoc}`);
              if (p.etat) sections.push(`État: ${p.etat}`);
              if (p.datappro)
                sections.push(`Date d'approbation: ${p.datappro}`);
              if (p.nom) sections.push(`Nom: ${p.nom}`);
            }
          }
        }

        return {
          content: [{ type: 'text' as const, text: sections.join('\n') }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur GPU: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. Servitudes d'utilité publique
  server.tool(
    'urbanisme_servitudes',
    "Identifie les servitudes d'utilité publique (SUP) à un point GPS: prescriptions surfaciques, linéaires, ponctuelles et assiettes de servitude. Important pour connaître les contraintes réglementaires du terrain (recul, protection, alignement).",
    {
      latitude: z.number().describe('Latitude du site'),
      longitude: z.number().describe('Longitude du site'),
    },
    async ({ latitude, longitude }) => {
      try {
        const geom = makePointGeom(longitude, latitude);

        // Fetch all types of servitudes in parallel
        const [prescSurf, prescLin, prescPct, assiette] =
          await Promise.allSettled([
            fetchGPU('/prescription-surf', { geom }),
            fetchGPU('/prescription-lin', { geom }),
            fetchGPU('/prescription-pct', { geom }),
            fetchGPU('/assiette-sup-s', { geom }),
          ]);

        const sections: string[] = [
          `# Servitudes — ${latitude}, ${longitude}\n`,
        ];

        if (prescSurf.status === 'fulfilled') {
          sections.push('## Prescriptions surfaciques');
          sections.push(formatServitudesResult(prescSurf.value));
        }

        if (prescLin.status === 'fulfilled') {
          sections.push('## Prescriptions linéaires');
          sections.push(formatServitudesResult(prescLin.value));
        }

        if (prescPct.status === 'fulfilled') {
          sections.push('## Prescriptions ponctuelles');
          sections.push(formatServitudesResult(prescPct.value));
        }

        if (assiette.status === 'fulfilled') {
          const aData = assiette.value as {
            features: Array<{
              properties: {
                libelle?: string;
                libelong?: string;
                nomfic?: string;
                urlfic?: string;
              };
            }>;
          };
          if (aData.features?.length > 0) {
            sections.push(
              `## Assiettes de servitude: ${aData.features.length}`,
            );
            for (const f of aData.features) {
              const p = f.properties;
              if (p.libelle)
                sections.push(`- ${p.libelle}${p.libelong ? ': ' + p.libelong : ''}`);
            }
          } else {
            sections.push('## Assiettes de servitude: aucune');
          }
        }

        return {
          content: [{ type: 'text' as const, text: sections.join('\n') }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Erreur GPU servitudes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
