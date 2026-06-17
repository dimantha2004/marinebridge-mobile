// Helper for sending Expo push notifications from Edge Functions.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data?: Record<string, unknown>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sends an Expo push notification to the provided tokens.
 * Null / empty tokens are ignored. Tokens are chunked to respect Expo limits.
 * Never throws on a failed HTTP response — logs and continues.
 */
export async function sendExpoPush(
  tokens: (string | null | undefined)[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const validTokens = tokens.filter(
    (t): t is string => typeof t === 'string' && t.trim().length > 0,
  );

  if (validTokens.length === 0) {
    return;
  }

  const accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');

  for (const tokenChunk of chunk(validTokens, CHUNK_SIZE)) {
    const messages: ExpoPushMessage[] = tokenChunk.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      ...(data ? { data } : {}),
    }));

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Expo push failed (${res.status}): ${text}`);
      }
    } catch (err) {
      console.error('Expo push request error:', err);
    }
  }
}
