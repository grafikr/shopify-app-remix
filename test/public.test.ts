import { describe, expect, test } from 'bun:test';

import { APP_URL, bearerRequest, sessionToken, setup, SHOP, thrown } from './helpers.ts';

describe.each(['checkout', 'customerAccount'] as const)('authenticate.public.%s', (kind) => {
  test('returns the session token and a cors helper', async () => {
    const { app } = setup();
    const request = await bearerRequest('/api', { headers: { Origin: 'https://extensions.shopifycdn.com' } });
    const { sessionToken: token, cors } = await app.authenticate.public[kind](request);
    expect(token.dest).toBe(`https://${SHOP}`);
    expect(cors(new Response()).headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  test('401 without a session token', async () => {
    const { app } = setup();
    const response = await thrown(() => app.authenticate.public[kind](new Request(`${APP_URL}/api`)));
    expect(response.status).toBe(401);
  });

  test('accepts tokens for any audience (extension tokens)', async () => {
    const { app } = setup();
    const request = await bearerRequest('/api', {}, await sessionToken({}, 'some-extension-client-id'));
    expect((await app.authenticate.public[kind](request)).sessionToken.sub).toBe('1');
  });

  test('answers OPTIONS preflight with 204 and extra cors headers', async () => {
    const { app } = setup();
    const request = new Request(`${APP_URL}/api`, { method: 'OPTIONS', headers: { Origin: 'https://other.com' } });
    const response = await thrown(() => app.authenticate.public[kind](request, { corsHeaders: ['X-Custom'] }));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type, X-Custom');
  });
});

describe('authenticate.pos', () => {
  test('returns the session token', async () => {
    const { app } = setup();
    const { sessionToken: token } = await app.authenticate.pos(await bearerRequest('/pos'));
    expect(token.dest).toBe(`https://${SHOP}`);
  });

  test('401 without a session token', async () => {
    const { app } = setup();
    expect((await thrown(() => app.authenticate.pos(new Request(`${APP_URL}/pos`)))).status).toBe(401);
  });
});
