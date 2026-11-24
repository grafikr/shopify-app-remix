import { afterEach, describe, expect, test } from 'bun:test';

import { AppDistribution } from '../src/index.ts';
import { APP_URL, bearerRequest, mockFetch, offlineSession, sessionToken, setup, SHOP, thrown } from './helpers.ts';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

describe('authenticate.admin', () => {
  test('returns the full context for a valid token and stored session', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const context = await app.authenticate.admin(await bearerRequest('/app'));
    expect(context.session.accessToken).toBe('access-token');
    expect(context.sessionToken.dest).toBe(`https://${SHOP}`);
    for (const key of ['require', 'check', 'request', 'cancel', 'createUsageRecord', 'updateUsageCappedAmount']) {
      expect(typeof (context.billing as any)[key]).toBe('function');
    }
    for (const key of ['query', 'request', 'revoke']) {
      expect(typeof (context.scopes as any)[key]).toBe('function');
    }
    expect(typeof context.redirect).toBe('function');
    expect(typeof context.cors).toBe('function');
  });

  test('exchanges the session token for an offline token when no session is stored', async () => {
    const { app, store } = setup();
    const fetchMock = mockFetch(() => ({ access_token: 'new-token', scope: 'read_products' }));
    restore = fetchMock.restore;

    const context = await app.authenticate.admin(await bearerRequest('/app'));

    expect(fetchMock.calls[0]?.url).toBe(`https://${SHOP}/admin/oauth/access_token`);
    expect(context.session.accessToken).toBe('new-token');
    expect(store.get(`offline_${SHOP}`)?.accessToken).toBe('new-token');
  });

  test('runs afterAuth once per session token', async () => {
    const afterAuthCalls: string[] = [];
    const { app } = setup({ hooks: { afterAuth: async ({ session }: any) => void afterAuthCalls.push(session.shop) } });
    restore = mockFetch(() => ({ access_token: 'new-token', scope: 'read_products' })).restore;

    const token = await sessionToken();
    await app.authenticate.admin(await bearerRequest('/app', {}, token));
    expect(afterAuthCalls).toEqual([SHOP]);
  });

  test('401 for an invalid session token on a data request', async () => {
    const { app } = setup();
    const response = await thrown(async () => app.authenticate.admin(await bearerRequest('/app', {}, 'garbage')));
    expect(response.status).toBe(401);
    expect(response.headers.get('X-Shopify-Retry-Invalid-Session-Request')).toBe('1');
  });

  test('410 for bots', async () => {
    const { app } = setup();
    const request = new Request(`${APP_URL}/app`, { headers: { 'User-Agent': 'Googlebot/2.1' } });
    expect((await thrown(() => app.authenticate.admin(request))).status).toBe(410);
  });

  test('204 for OPTIONS preflight with cors headers', async () => {
    const { app } = setup();
    const request = new Request(`${APP_URL}/app`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://ext.example.com' },
    });
    const response = await thrown(() => app.authenticate.admin(request));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  test('renders App Bridge on the session-token path', async () => {
    const { app } = setup();
    const response = await thrown(() =>
      app.authenticate.admin(new Request(`${APP_URL}/auth/session-token?shop=${SHOP}`)),
    );
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('data-api-key="test-key"');
  });

  test('document request outside the admin redirects to the embedded app url', async () => {
    const { app } = setup();
    const host = btoa('admin.shopify.com/store/test-shop');
    const response = await thrown(() =>
      app.authenticate.admin(new Request(`${APP_URL}/app?shop=${SHOP}&host=${host}`)),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('admin.shopify.com/store/test-shop/apps/test-key');
  });

  test('embedded document request without id_token goes to the bounce page', async () => {
    const { app } = setup();
    const host = btoa('admin.shopify.com/store/test-shop');
    const response = await thrown(() =>
      app.authenticate.admin(new Request(`${APP_URL}/app?shop=${SHOP}&host=${host}&embedded=1`)),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toStartWith('/auth/session-token?');
  });

  test('refuses untrusted exit-iframe destinations', async () => {
    const { app } = setup();
    const url = `${APP_URL}/auth/exit-iframe?shop=${SHOP}&exitIframe=${encodeURIComponent('https://evil.com')}`;
    const error = await thrown<Error>(() => app.authenticate.admin(new Request(url)));
    expect(error.message).toContain('Invalid exit-iframe destination');
  });

  test('exit-iframe renders App Bridge for trusted destinations', async () => {
    const { app } = setup();
    const url = `${APP_URL}/auth/exit-iframe?shop=${SHOP}&exitIframe=${encodeURIComponent('https://admin.shopify.com/store/x')}`;
    const response = await thrown(() => app.authenticate.admin(new Request(url)));
    expect(await response.text()).toContain('window.open("https://admin.shopify.com/store/x"');
  });

  test('on a 401 from the API, clears the token and asks for a retry', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const { admin } = await app.authenticate.admin(await bearerRequest('/app'));
    restore = mockFetch(() => ({}), 401).restore;

    const response = await thrown(() => admin.graphql('{ shop { name } }'));
    expect(response.status).toBe(401);
    expect(store.get(`offline_${SHOP}`)?.accessToken).toBeUndefined();
  });

  test('admin.graphql resolves to a Response with the JSON body', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const { admin } = await app.authenticate.admin(await bearerRequest('/app'));
    const fetchMock = mockFetch(() => ({ data: { shop: { name: 'Shop' } } }));
    restore = fetchMock.restore;

    const response = await admin.graphql('{ shop { name } }');
    expect((await response.json()).data).toEqual({ shop: { name: 'Shop' } });
    expect(fetchMock.calls[0]?.url).toContain(`https://${SHOP}/admin/api/`);
    expect((fetchMock.calls[0]?.init?.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe(
      'access-token',
    );
  });

  describe('redirect()', () => {
    const context = async (path: string, init: RequestInit = {}) => {
      const { app, store } = setup();
      store.set(`offline_${SHOP}`, offlineSession());
      const host = btoa('admin.shopify.com/store/test-shop');
      return app.authenticate.admin(
        await bearerRequest(`${path}${path.includes('?') ? '&' : '?'}shop=${SHOP}&host=${host}`, init),
      );
    };

    test('app paths redirect with a plain 302 and keep the embedded params', async () => {
      const { redirect } = await context('/app');
      const response = redirect('/app/other');
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('Location')!);
      expect(location.pathname).toBe('/app/other');
      expect(location.searchParams.get('shop')).toBe(SHOP);
    });

    test('shopify:admin urls on data requests respond with reauthorize headers', async () => {
      const { redirect } = await context('/app', { method: 'POST' });
      const response = await thrown(async () => redirect('shopify:admin/products'));
      expect(response.status).toBe(401);
      expect(response.headers.get('X-Shopify-API-Request-Failure-Reauthorize-Url')).toBe(
        'https://admin.shopify.com/store/test-shop/products',
      );
    });
  });
});

describe('authenticate.admin (ShopifyAdmin distribution)', () => {
  const customApp = () =>
    setup({
      distribution: AppDistribution.ShopifyAdmin,
      adminApiAccessToken: 'shpat_custom',
      sessionStorage: undefined,
    });

  test('builds a session without a session token and omits embedded features', async () => {
    const { app } = customApp();
    const context = await app.authenticate.admin(new Request(`${APP_URL}/app?shop=${SHOP}`));
    expect(context.session.shop).toBe(SHOP);
    expect('redirect' in context).toBe(false);
    expect('sessionToken' in context).toBe(false);
    expect(typeof context.billing.check).toBe('function');
  });

  test('has no login()', () => {
    expect('login' in customApp().app).toBe(false);
  });
});
