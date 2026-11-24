import { afterEach, describe, expect, test } from 'bun:test';

import { bearerRequest, mockFetch, offlineSession, setup, SHOP, thrown } from './helpers.ts';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

async function adminContext() {
  const { app, store } = setup();
  store.set(`offline_${SHOP}`, offlineSession());
  return app.authenticate.admin(await bearerRequest('/app'));
}

const subscriptions = (active: { id: string; name: string; test: boolean }[]) => ({
  data: {
    currentAppInstallation: {
      activeSubscriptions: active,
      oneTimePurchases: { edges: [], pageInfo: { hasNextPage: false } },
    },
  },
});

describe('billing', () => {
  test('check() reports an active plan', async () => {
    const { billing } = await adminContext();
    restore = mockFetch(() => subscriptions([{ id: 'gid://1', name: 'Pro', test: true }])).restore;
    const result = await billing.check({ plans: ['Pro'] as never, isTest: true });
    expect(result.hasActivePayment).toBe(true);
    expect(result.appSubscriptions[0]?.name).toBe('Pro');
  });

  test('check() reports no active plan', async () => {
    const { billing } = await adminContext();
    restore = mockFetch(() => subscriptions([])).restore;
    expect((await billing.check({ plans: ['Pro'] as never, isTest: true })).hasActivePayment).toBe(false);
  });

  test('require() returns the data when a plan is active', async () => {
    const { billing } = await adminContext();
    restore = mockFetch(() => subscriptions([{ id: 'gid://1', name: 'Pro', test: true }])).restore;
    const onFailure = async () => new Response('nope');
    expect((await billing.require({ plans: ['Pro'] as never, isTest: true, onFailure })).hasActivePayment).toBe(true);
  });

  test('require() throws what onFailure returns when there is no plan', async () => {
    const { billing } = await adminContext();
    restore = mockFetch(() => subscriptions([])).restore;
    const response = await thrown(() =>
      billing.require({
        plans: ['Pro'] as never,
        isTest: true,
        onFailure: async () => new Response('upgrade', { status: 402 }),
      }),
    );
    expect(response.status).toBe(402);
  });

  test('request() throws a redirect out of the app to the confirmation url', async () => {
    const { billing } = await adminContext();
    restore = mockFetch(() => ({
      data: {
        appSubscriptionCreate: {
          appSubscription: { id: 'gid://1' },
          confirmationUrl: 'https://test-shop.myshopify.com/admin/charges/confirm',
          userErrors: [],
        },
      },
    })).restore;
    const response = await thrown(() => billing.request({ plan: 'Pro' as never, isTest: true }));
    // XHR (authorization header) requests are answered with reauthorize headers.
    expect(response.status).toBe(401);
    expect(response.headers.get('X-Shopify-API-Request-Failure-Reauthorize-Url')).toBe(
      'https://test-shop.myshopify.com/admin/charges/confirm',
    );
  });

  test('cancel() cancels the subscription', async () => {
    const { billing } = await adminContext();
    const fetchMock = mockFetch(() => ({
      data: { appSubscriptionCancel: { appSubscription: { id: 'gid://1', status: 'CANCELLED' }, userErrors: [] } },
    }));
    restore = fetchMock.restore;
    const result = await billing.cancel({ subscriptionId: 'gid://1', isTest: true });
    expect(result.status).toBe('CANCELLED');
    expect(JSON.parse(String(fetchMock.calls[0]?.init?.body)).variables.id).toBe('gid://1');
  });
});

describe('scopes', () => {
  const details = {
    data: {
      app: {
        requestedAccessScopes: [{ handle: 'read_products' }],
        optionalAccessScopes: [{ handle: 'read_orders' }],
        installation: { accessScopes: [{ handle: 'read_products' }, { handle: 'write_products' }] },
      },
    },
  };

  test('query() maps granted, required and optional scopes', async () => {
    const { scopes } = await adminContext();
    restore = mockFetch(() => details).restore;
    const result = await scopes.query();
    expect(result.granted).toEqual(['read_products', 'write_products']);
    expect(result.required).toEqual(['read_products']);
    expect(result.optional).toEqual(['read_orders']);
  });

  test('request() resolves when the scopes are already granted', async () => {
    const { scopes } = await adminContext();
    restore = mockFetch(() => details).restore;
    await scopes.request(['read_products']);
  });

  test('request() is a no-op for an empty list', async () => {
    const { scopes } = await adminContext();
    const fetchMock = mockFetch(() => details);
    restore = fetchMock.restore;
    await scopes.request([]);
    expect(fetchMock.calls).toHaveLength(0);
  });

  test('request() sends the merchant to the install page for missing scopes', async () => {
    const { scopes } = await adminContext();
    restore = mockFetch(() => details).restore;
    const response = await thrown(() => scopes.request(['read_orders']));
    const url = new URL(response.headers.get('X-Shopify-API-Request-Failure-Reauthorize-Url')!);
    expect(url.pathname).toBe('/admin/oauth/install');
    expect(url.searchParams.get('optional_scopes')).toBe('read_orders');
    expect(url.searchParams.get('client_id')).toBe('test-key');
  });

  test('revoke() returns the revoked handles', async () => {
    const { scopes } = await adminContext();
    restore = mockFetch(() => ({
      data: { appRevokeAccessScopes: { revoked: [{ handle: 'write_products' }], userErrors: [] } },
    })).restore;
    expect(await scopes.revoke(['write_products'])).toEqual({ revoked: ['write_products'] });
  });

  test('revoke() throws 422 on user errors', async () => {
    const { scopes } = await adminContext();
    restore = mockFetch(() => ({
      data: { appRevokeAccessScopes: { revoked: [], userErrors: [{ field: 'scopes', message: 'bad' }] } },
    })).restore;
    expect((await thrown(() => scopes.revoke(['x']))).status).toBe(422);
  });

  test('revoke() throws 400 without scopes', async () => {
    const { scopes } = await adminContext();
    expect((await thrown(() => scopes.revoke([]))).status).toBe(400);
  });
});
