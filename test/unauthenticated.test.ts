import { describe, expect, test } from 'bun:test';

import { SessionNotFoundError } from '../src/index.ts';
import { offlineSession, setup, SHOP, thrown } from './helpers.ts';

describe.each(['admin', 'storefront'] as const)('unauthenticated.%s', (kind) => {
  test('returns a context for a shop with an offline session', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const context = await app.unauthenticated[kind](SHOP);
    expect(context.session.shop).toBe(SHOP);
    expect(typeof (context as any)[kind].graphql).toBe('function');
  });

  test('throws SessionNotFoundError without a session', async () => {
    const { app } = setup();
    const error = await thrown<Error>(() => app.unauthenticated[kind]('unknown.myshopify.com'));
    expect(error).toBeInstanceOf(SessionNotFoundError);
  });
});
