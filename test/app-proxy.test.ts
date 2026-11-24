import { describe, expect, test } from 'bun:test';

import { APP_URL, offlineSession, setup, signedAppProxyUrl, SHOP, thrown } from './helpers.ts';

describe('authenticate.public.appProxy', () => {
  test('returns a full context for a signed request with a session', async () => {
    const { app, store } = setup();
    store.set(`offline_${SHOP}`, offlineSession());
    const context = await app.authenticate.public.appProxy(new Request(signedAppProxyUrl()));
    expect(context.session?.shop).toBe(SHOP);
    expect(context.admin).toBeDefined();
    expect(context.storefront).toBeDefined();
  });

  test('returns an empty context when the shop has no session', async () => {
    const { app } = setup();
    const context = await app.authenticate.public.appProxy(new Request(signedAppProxyUrl()));
    expect(context.session).toBeUndefined();
    expect(context.admin).toBeUndefined();
    expect(context.storefront).toBeUndefined();
  });

  test('400 for a bad signature', async () => {
    const { app } = setup();
    const response = await thrown(() =>
      app.authenticate.public.appProxy(new Request(signedAppProxyUrl({}, 'wrong-secret'))),
    );
    expect(response.status).toBe(400);
  });

  test('400 when the signature is missing', async () => {
    const { app } = setup();
    const response = await thrown(() =>
      app.authenticate.public.appProxy(new Request(`${APP_URL}/proxy?shop=${SHOP}&timestamp=1`)),
    );
    expect(response.status).toBe(400);
  });

  describe('liquid()', () => {
    const liquid = async () => {
      const { app } = setup();
      return (await app.authenticate.public.appProxy(new Request(signedAppProxyUrl()))).liquid;
    };

    test('sets the liquid content type and defaults to 200', async () => {
      const response = (await liquid())('<p>hi</p>');
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/liquid');
      expect(await response.text()).toBe('<p>hi</p>');
    });

    test('accepts a status number', async () => {
      expect((await liquid())('x', 404).status).toBe(404);
    });

    test('layout: false prepends the none layout tag', async () => {
      const response = (await liquid())('<p>hi</p>', { layout: false, status: 201 });
      expect(response.status).toBe(201);
      expect(await response.text()).toBe('{% layout none %} <p>hi</p>');
    });

    test('adds trailing slashes to relative links and form actions', async () => {
      const response = (await liquid())('<a href="/foo">x</a><form action="/bar"></form>');
      expect(await response.text()).toBe('<a href="/foo/">x</a><form action="/bar/"></form>');
    });
  });
});
