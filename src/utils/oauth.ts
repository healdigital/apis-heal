import { fetchWithTimeout } from './fetch.js';
import { logger } from './logger.js';
import { getConfig } from './config.js';

const PISTE_TOKEN_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';

interface OAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  obtained_at: number;
}

let cachedToken: OAuthToken | null = null;

export function isLegifranceConfigured(): boolean {
  const config = getConfig();
  return !!(config.LEGIFRANCE_CLIENT_ID && config.LEGIFRANCE_CLIENT_SECRET);
}

export async function getLegifranceToken(): Promise<string> {
  const config = getConfig();
  const clientId = config.LEGIFRANCE_CLIENT_ID;
  const clientSecret = config.LEGIFRANCE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Légifrance non configuré: LEGIFRANCE_CLIENT_ID et LEGIFRANCE_CLIENT_SECRET requis',
    );
  }

  // Return cached token if still valid (with 60s margin)
  if (
    cachedToken &&
    Date.now() - cachedToken.obtained_at <
      (cachedToken.expires_in - 60) * 1000
  ) {
    logger.debug('Using cached Legifrance token');
    return cachedToken.access_token;
  }

  logger.info('Fetching new Legifrance OAuth token');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'openid',
  });

  const response = await fetchWithTimeout(PISTE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    timeout: 10000,
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error('OAuth PISTE token fetch failed', undefined, {
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`OAuth PISTE error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };

  cachedToken = {
    ...data,
    obtained_at: Date.now(),
  };

  logger.info('Legifrance OAuth token obtained successfully', {
    expiresIn: data.expires_in,
  });

  return cachedToken.access_token;
}
