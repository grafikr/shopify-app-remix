import { createHmac } from 'node:crypto';

import { setAbstractFetchFunc } from '@shopify/shopify-api/runtime';
import { SignJWT } from 'jose';

import { ApiVersion, BillingInterval, Session, shopifyApp, type SessionStorage } from '../src/index.ts';
import '../src/adapters/node/index.ts';

export const API_KEY = 'test-key';
export const API_SECRET = 'test-secret';
export const APP_URL = 'https://app.example.com';
export const SHOP = 'test-shop.myshopify.com';

export function createMemoryStorage() {
  const store = new Map<string, Session>();
  const storage: SessionStorage = {
    storeSession: async (session) => (store.set(session.id, session), true),
    loadSession: async (id) => store.get(id),
    deleteSession: async (id) => store.delete(id),
    deleteSessions: async (ids) => (ids.forEach((id) => store.delete(id)), true),
    findSessionsByShop: async (shop) => [...store.values()].filter((session) => session.shop === shop),
  };
  return { store, storage };
}

export function setup(overrides: Record<string, unknown> = {}) {
  const { store, storage } = createMemoryStorage();
  const app = shopifyApp({
    apiKey: API_KEY,
    apiSecretKey: API_SECRET,
    apiVersion: ApiVersion.October25,
    appUrl: APP_URL,
    scopes: ['read_products'],
    sessionStorage: storage,
    billing: {
      Pro: { lineItems: [{ amount: 5, currencyCode: 'USD', interval: BillingInterval.Every30Days }] },
    },
    logger: { level: 0, log: async () => {} },
    ...overrides,
  } as Parameters<typeof shopifyApp>[0]);
  return { app, store, storage };
}

export function offlineSession(shop = SHOP, overrides: Partial<ConstructorParameters<typeof Session>[0]> = {}) {
  return new Session({
    id: `offline_${shop}`,
    shop,
    state: 'state',
    isOnline: false,
    accessToken: 'access-token',
    scope: 'read_products',
    ...overrides,
  });
}

export async function sessionToken(claims: Record<string, unknown> = {}, audience = API_KEY) {
  return new SignJWT({
    dest: `https://${SHOP}`,
    iss: `https://${SHOP}/admin`,
    sub: '1',
    sid: 'sid',
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(audience)
    .setExpirationTime('1m')
    .setNotBefore('0s')
    .sign(new TextEncoder().encode(API_SECRET));
}

export async function bearerRequest(path = '/', init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token ?? (await sessionToken())}`);
  return new Request(`${APP_URL}${path}`, { ...init, headers });
}

export function hmac(body: string, secret = API_SECRET) {
  return createHmac('sha256', secret).update(body).digest('base64');
}

export function signedAppProxyUrl(extra: Record<string, string> = {}, secret = API_SECRET) {
  const params = new URLSearchParams({
    shop: SHOP,
    timestamp: String(Math.floor(Date.now() / 1000)),
    path_prefix: '/apps/test',
    ...extra,
  });
  const message = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('');
  params.set('signature', createHmac('sha256', secret).update(message).digest('hex'));
  return `${APP_URL}/proxy?${params}`;
}

/** Runs `fn` and returns whatever it throws (or rejects with). Fails the test if nothing is thrown. */
export async function thrown<T = Response>(fn: () => unknown): Promise<T> {
  try {
    await fn();
  } catch (error) {
    return error as T;
  }
  throw new Error('Expected function to throw');
}

/**
 * Replaces the fetch function `@shopify/shopify-api` uses. It captures `fetch` when the adapter is imported, so
 * patching `globalThis.fetch` afterwards would not intercept anything and requests would hit the network.
 */
export function mockFetch(handler: (url: string, init?: RequestInit) => unknown, status = 200) {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  setAbstractFetchFunc((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    return new Response(JSON.stringify(handler(url, init)), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as never);
  return { calls, restore: () => setAbstractFetchFunc(original as never) };
}
