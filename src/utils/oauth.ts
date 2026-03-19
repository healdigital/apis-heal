const PISTE_TOKEN_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';

interface OAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  obtained_at: number;
}

let cachedToken: OAuthToken | null = null;

export function isLegifranceConfigured(): boolean {
  return !!(
    process.env.LEGIFRANCE_CLIENT_ID && process.env.LEGIFRANCE_CLIENT_SECRET
  );
}

export async function getLegifranceToken(): Promise<string> {
  const clientId = process.env.LEGIFRANCE_CLIENT_ID;
  const clientSecret = process.env.LEGIFRANCE_CLIENT_SECRET;

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
    return cachedToken.access_token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'openid',
  });

  const response = await fetch(PISTE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
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

  return cachedToken.access_token;
}
