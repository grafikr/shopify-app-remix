import { describe, expect, test } from 'bun:test';

import { APP_URL, hmac, offlineSession, setup, SHOP, thrown } from './helpers.ts';

const body = JSON.stringify({ shopify_domain: SHOP, some: 'data' });
const post = (path: string, headers: Record<string, string>, payload = body) =>
  new Request(`${APP_URL}${path}`, { method: 'POST', body: payload, headers });

describe('authenticate.flow', () => {
  test('returns session, payload and admin for a valid request', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const context = await app.authenticate.flow(post('/flow', { 'X-Shopify-Hmac-Sha256': hmac(body) }));
    expect(context.session.shop).toBe(SHOP);
    expect(context.payload).toMatchObject({ some: 'data' });
    expect(typeof context.admin.graphql).toBe('function');
  });

  test('405 for non-POST', async () => {
    const { app } = setup();
    expect((await thrown(() => app.authenticate.flow(new Request(`${APP_URL}/flow`)))).status).toBe(405);
  });

  test('400 for an invalid signature', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const response = await thrown(() => app.authenticate.flow(post('/flow', { 'X-Shopify-Hmac-Sha256': 'nope' })));
    expect(response.status).toBe(400);
  });

  test('400 when the shop has no session', async () => {
    const { app } = setup();
    const response = await thrown(() => app.authenticate.flow(post('/flow', { 'X-Shopify-Hmac-Sha256': hmac(body) })));
    expect(response.status).toBe(400);
  });
});

describe('authenticate.fulfillmentService', () => {
  const headers = () => ({ 'X-Shopify-Hmac-Sha256': hmac(body), 'X-Shopify-Shop-Domain': SHOP });

  test('returns session, payload and admin for a valid request', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const context = await app.authenticate.fulfillmentService(post('/fs', headers()));
    expect(context.session.shop).toBe(SHOP);
    expect(context.payload).toMatchObject({ some: 'data' });
  });

  test('405 for non-POST', async () => {
    const { app } = setup();
    const response = await thrown(() => app.authenticate.fulfillmentService(new Request(`${APP_URL}/fs`)));
    expect(response.status).toBe(405);
  });

  test('400 for an invalid signature', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const response = await thrown(() =>
      app.authenticate.fulfillmentService(post('/fs', { ...headers(), 'X-Shopify-Hmac-Sha256': 'bad' })),
    );
    expect(response.status).toBe(400);
  });

  test('400 when the shop has no session', async () => {
    const { app } = setup();
    const response = await thrown(() => app.authenticate.fulfillmentService(post('/fs', headers())));
    expect(response.status).toBe(400);
  });
});
