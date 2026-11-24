import { describe, expect, test } from 'bun:test';

import { LoginErrorType } from '../src/index.ts';
import { APP_URL, hmac, offlineSession, setup, SHOP, thrown } from './helpers.ts';

const payload = JSON.stringify({ id: 1 });
const webhook = (headers: Record<string, string> = {}, method = 'POST') =>
  new Request(`${APP_URL}/webhooks`, {
    method,
    body: method === 'POST' ? payload : undefined,
    headers: {
      'X-Shopify-Hmac-Sha256': hmac(payload),
      'X-Shopify-Topic': 'products/create',
      'X-Shopify-Shop-Domain': SHOP,
      'X-Shopify-API-Version': '2025-10',
      'X-Shopify-Webhook-Id': 'webhook-id',
      ...headers,
    },
  });

describe('authenticate.webhook', () => {
  test('returns topic, shop, payload, session and admin', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const context = await app.authenticate.webhook(webhook());
    expect(context.shop).toBe(SHOP);
    expect(context.topic).toBe('PRODUCTS_CREATE');
    expect(context.payload).toEqual({ id: 1 });
    expect(context.session?.shop).toBe(SHOP);
    expect(context.admin).toBeDefined();
  });

  test('session and admin are undefined when the app is uninstalled', async () => {
    const { app } = setup();
    const context = await app.authenticate.webhook(webhook());
    expect(context.session).toBeUndefined();
    expect(context.admin).toBeUndefined();
  });

  test('401 for an invalid hmac', async () => {
    const { app } = setup();
    expect((await thrown(() => app.authenticate.webhook(webhook({ 'X-Shopify-Hmac-Sha256': 'bad' })))).status).toBe(
      401,
    );
  });

  test('400 when headers are missing', async () => {
    const { app } = setup();
    const request = new Request(`${APP_URL}/webhooks`, {
      method: 'POST',
      body: payload,
      headers: { 'X-Shopify-Hmac-Sha256': hmac(payload) },
    });
    expect((await thrown(() => app.authenticate.webhook(request))).status).toBe(400);
  });

  test('405 for non-POST', async () => {
    const { app } = setup();
    expect((await thrown(() => app.authenticate.webhook(webhook({}, 'GET')))).status).toBe(405);
  });
});

describe('login', () => {
  const login = async (url: string, init?: RequestInit) => {
    const { app } = setup();
    return thrown(() => app.login!(new Request(url, init)));
  };

  test('returns {} for a GET without a shop', async () => {
    const { app } = setup();
    expect(await app.login!(new Request(`${APP_URL}/auth/login`))).toEqual({});
  });

  test('redirects to the install page', async () => {
    const response = await login(`${APP_URL}/auth/login?shop=test-shop`);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      `https://admin.shopify.com/store/test-shop/oauth/install?client_id=test-key`,
    );
  });

  test('reads the shop from a form post', async () => {
    const response = await login(`${APP_URL}/auth/login`, {
      method: 'POST',
      body: new URLSearchParams({ shop: SHOP }),
    });
    expect(response.headers.get('Location')).toContain('/oauth/install?client_id=test-key');
  });

  test('reports a missing shop', async () => {
    const { app } = setup();
    const result = await app.login!(
      new Request(`${APP_URL}/auth/login`, { method: 'POST', body: new URLSearchParams() }),
    );
    expect(result).toEqual({ shop: LoginErrorType.MissingShop });
  });

  test('reports an invalid shop', async () => {
    const { app } = setup();
    const result = await app.login!(new Request(`${APP_URL}/auth/login?shop=evil.com`));
    expect(result).toEqual({ shop: LoginErrorType.InvalidShop });
  });
});

describe('addDocumentResponseHeaders', () => {
  test('sets Link and frame-ancestors for a valid shop', () => {
    const { app } = setup();
    const headers = new Headers();
    app.addDocumentResponseHeaders(new Request(`${APP_URL}/app?shop=${SHOP}`), headers);
    expect(headers.get('Content-Security-Policy')).toContain(`frame-ancestors https://${SHOP}`);
    expect(headers.get('Link')).toContain('app-bridge.js');
  });

  test('ignores an invalid shop', () => {
    const { app } = setup();
    const headers = new Headers();
    app.addDocumentResponseHeaders(new Request(`${APP_URL}/app?shop=evil.com`), headers);
    expect(headers.get('Content-Security-Policy')).toBeNull();
  });
});

describe('shopifyApp config', () => {
  test('throws on an invalid appUrl', () => {
    expect(() => setup({ appUrl: 'nope' })).toThrow('Invalid appUrl');
  });

  test('throws on isEmbeddedApp', () => {
    expect(() => setup({ isEmbeddedApp: false })).toThrow('isEmbeddedApp');
  });

  test('throws without session storage for app store distribution', () => {
    expect(() => setup({ sessionStorage: undefined })).toThrow('session storage');
  });
});
