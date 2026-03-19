import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { registerBoampTools } from './tools/boamp.js';
import { registerGeorisquesTools } from './tools/georisques.js';
import { registerCadastreTools } from './tools/cadastre.js';
import { registerUrbanismeTools } from './tools/urbanisme.js';
import { registerBaseCarboneTools } from './tools/base-carbone.js';
import { registerLegifranceTools } from './tools/legifrance.js';
import { registerGeocodeTools } from './utils/geocode.js';

const server = new McpServer({
  name: 'french-public-apis',
  version: '1.0.0',
});

// Register all tool modules
registerGeocodeTools(server);
registerBoampTools(server);
registerGeorisquesTools(server);
registerCadastreTools(server);
registerUrbanismeTools(server);
registerBaseCarboneTools(server);
registerLegifranceTools(server);

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', server: 'french-public-apis', version: '1.0.0' });
});

// Stateless MCP endpoint
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

app.post('/mcp', async (req: Request, res: Response) => {
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_req: Request, res: Response) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    }),
  );
});

app.delete('/mcp', (_req: Request, res: Response) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    }),
  );
});

const PORT = process.env.PORT || 3100;

async function main() {
  await server.connect(transport);
  app.listen(PORT, () => {
    console.log(`MCP French APIs server listening on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
