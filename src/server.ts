import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { registerBoampTools } from './tools/boamp.js';
import { registerGeorisquesTools } from './tools/georisques.js';
import { registerCadastreTools } from './tools/cadastre.js';
import { registerUrbanismeTools } from './tools/urbanisme.js';
import { registerBaseCarboneTools } from './tools/base-carbone.js';
import { registerLegifranceTools } from './tools/legifrance.js';
import { registerGeocodeTools } from './utils/geocode.js';
import { loadConfig, getConfig } from './utils/config.js';
import { logger } from './utils/logger.js';

// Load and validate configuration at startup
try {
  loadConfig();
  const config = getConfig();
  logger.info('Configuration loaded successfully', {
    port: config.PORT,
    nodeEnv: config.NODE_ENV,
    legifranceConfigured: !!(config.LEGIFRANCE_CLIENT_ID && config.LEGIFRANCE_CLIENT_SECRET),
  });
} catch (error) {
  logger.error('Failed to load configuration', error);
  process.exit(1);
}

function createServer(): McpServer {
  const server = new McpServer({
    name: 'french-public-apis',
    version: '1.0.0',
  });

  registerGeocodeTools(server);
  registerBoampTools(server);
  registerGeorisquesTools(server);
  registerCadastreTools(server);
  registerUrbanismeTools(server);
  registerBaseCarboneTools(server);
  registerLegifranceTools(server);

  return server;
}

const config = getConfig();
const app = express();

// Request size limit
app.use(express.json({ limit: config.MAX_REQUEST_SIZE }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    server: 'french-public-apis',
    version: '1.0.0',
    environment: config.NODE_ENV,
  });
});

// Stateless MCP endpoint - new server+transport per request
app.post('/mcp', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7);

  try {
    logger.debug('Processing MCP request', { requestId });

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    logger.debug('MCP request completed', { requestId });
  } catch (error) {
    logger.error('Error handling MCP request', error, { requestId });

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data:
            config.NODE_ENV === 'development' && error instanceof Error
              ? { message: error.message, stack: error.stack }
              : undefined,
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST.' },
    id: null,
  });
});

app.delete('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST.' },
    id: null,
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    message: 'Available endpoints: GET /health, POST /mcp',
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', err);

  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      message: config.NODE_ENV === 'development' ? err.message : 'An error occurred',
    });
  }
});

const server = app.listen(config.PORT, () => {
  logger.info('Server started', {
    port: config.PORT,
    environment: config.NODE_ENV,
    endpoints: {
      health: `http://localhost:${config.PORT}/health`,
      mcp: `http://localhost:${config.PORT}/mcp`,
    },
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
