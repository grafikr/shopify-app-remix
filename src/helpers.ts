import { ShopifyError } from '@shopify/shopify-api';
import { isbot } from 'isbot';

import type { BasicParams } from './types.ts';

export const APP_BRIDGE_URL = 'https://cdn.shopify.com/shopifycloud/app-bridge.js';
export const CDN_URL = 'https://cdn.shopify.com';
export const POLARIS_URL = 'https://cdn.shopify.com/shopifycloud/polaris.js';
export const REAUTH_URL_HEADER = 'X-Shopify-API-Request-Failure-Reauthorize-Url';
export const RETRY_INVALID_SESSION_HEADER = {
  'X-Shopify-Retry-Invalid-Session-Request': '1',
};

/** Response with a mutable `Location` header (unlike `Response.redirect`), so CORS headers can be added. */
export function redirect(url: string, init?: number | ResponseInit): Response {
  const options: ResponseInit = typeof init === 'number' ? { status: init } : (init ?? {});
  const headers = new Headers(options.headers);
  headers.set('Location', url);
  return new Response(null, { status: 302, ...options, headers });
}

export function getShopFromRequest(request: Request) {
  return new URL(request.url).searchParams.get('shop');
}

export function getSessionTokenHeader(request: Request) {
  return request.headers.get('authorization')?.replace('Bearer ', '');
}

export function getSessionTokenFromUrlParam(request: Request) {
  return new URL(request.url).searchParams.get('id_token');
}

// ---------------------------------------------------------------------------------------------
// Response headers

export function addDocumentResponseHeadersFactory({ api, config }: BasicParams) {
  return (request: Request, headers: Headers) => {
    const shop = api.utils.sanitizeShop(new URL(request.url).searchParams.get('shop') ?? '');
    addDocumentResponseHeaders(headers, shop, config.polarisUrl);
  };
}

export function addDocumentResponseHeaders(headers: Headers, shop: string | null, polarisUrl = POLARIS_URL) {
  if (!shop) return;
  headers.set(
    'Link',
    `<${CDN_URL}>; rel="preconnect", <${APP_BRIDGE_URL}>; rel="preload"; as="script", <${polarisUrl}>; rel="preload"; as="script"`,
  );
  headers.set(
    'Content-Security-Policy',
    `frame-ancestors https://${shop} https://admin.shopify.com https://*.spin.dev https://admin.myshopify.io https://admin.shop.dev;`,
  );
}

export function ensureCORSHeadersFactory(
  { config, logger }: BasicParams,
  request: Request,
  corsHeaders: string[] = [],
) {
  return function ensureCORSHeaders(response: Response) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== config.appUrl) {
      logger.debug('Request comes from a different origin, adding CORS headers');
      const allowed = new Set(['Authorization', 'Content-Type', ...corsHeaders]);
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Headers', [...allowed].join(', '));
      response.headers.set('Access-Control-Expose-Headers', REAUTH_URL_HEADER);
    }
    return response;
  };
}

// ---------------------------------------------------------------------------------------------
// Bot / OPTIONS handling

const SHOPIFY_USER_AGENTS = [/Shopify POS\//, /Shopify Mobile\//];

export function respondToBotRequest({ logger }: BasicParams, request: Request) {
  const userAgent = request.headers.get('User-Agent') ?? '';
  if (SHOPIFY_USER_AGENTS.some((agent) => agent.test(userAgent))) return;
  if (isbot(userAgent)) {
    logger.debug('Request is from a bot, skipping auth');
    throw new Response(undefined, { status: 410, statusText: 'Gone' });
  }
}

export function respondToOptionsRequest(params: BasicParams, request: Request) {
  if (request.method === 'OPTIONS') {
    throw ensureCORSHeadersFactory(
      params,
      request,
    )(
      new Response(null, {
        status: 204,
        headers: { 'Access-Control-Max-Age': '7200' },
      }),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// App Bridge pages and redirects

const FILE_URI_MATCH = /\/\/\//;
const INVALID_RELATIVE_URL = /[/\\][/\\]/;
const WHITESPACE_CHARACTER = /\s/;

function isSafeRedirect(domain: string, redirectUrl: unknown, requireSSL = true) {
  if (typeof redirectUrl !== 'string') return false;
  if (FILE_URI_MATCH.test(redirectUrl) || WHITESPACE_CHARACTER.test(redirectUrl)) return false;
  let url: URL;
  try {
    url = new URL(redirectUrl, domain);
  } catch {
    return false;
  }
  if (INVALID_RELATIVE_URL.test(url.pathname)) return false;
  if (!['https:', 'http:'].includes(url.protocol)) return false;
  if (requireSSL && url.protocol !== 'https:') return false;
  return true;
}

function sanitizeRedirectUrl(domain: string, redirectUrl: string) {
  if (isSafeRedirect(domain, redirectUrl)) return new URL(redirectUrl, domain);
  throw new ShopifyError('Invalid URL. Refusing to redirect');
}

/** Only the app's own origin and the Shopify admin are valid exit-iframe destinations. */
export function isTrustedExitIframeDestination(appUrl: string, destination: string | null) {
  if (typeof destination !== 'string' || destination.trim() === '') return false;
  let url: URL;
  let appOrigin: string;
  try {
    url = new URL(destination, appUrl);
    appOrigin = new URL(appUrl).origin;
  } catch {
    return false;
  }
  if (url.origin === appOrigin) return true;
  if (url.protocol !== 'https:' || url.port !== '') return false;
  if (url.hostname === 'admin.shopify.com') return true;
  return /\.myshopify\.com$/i.test(url.hostname) && (url.pathname === '/admin' || url.pathname.startsWith('/admin/'));
}

/** Throws a page that loads App Bridge (which fetches a session token), optionally redirecting afterwards. */
export function renderAppBridge(
  { api, config }: BasicParams,
  request: Request,
  redirectTo?: { url: string; target?: string },
): never {
  let redirectToScript = '';
  if (redirectTo) {
    const destination = sanitizeRedirectUrl(config.appUrl, redirectTo.url);
    const target = redirectTo.target ?? '_top';
    redirectToScript = `<script>window.open(${JSON.stringify(destination.toString())}, ${JSON.stringify(target)})</script>`;
  }

  const headers = new Headers({ 'content-type': 'text/html;charset=utf-8' });
  // Sanitized so an attacker-controlled `?shop=evil.com` can't end up in the CSP header.
  const shop = api.utils.sanitizeShop(new URL(request.url).searchParams.get('shop') ?? '');
  addDocumentResponseHeaders(headers, shop, config.polarisUrl);

  throw new Response(
    `
      <script data-api-key="${config.apiKey}" src="${APP_BRIDGE_URL}"></script>
      ${redirectToScript}
    `,
    { headers },
  );
}

export function redirectToBouncePage({ config }: Pick<BasicParams, 'config'>, url: URL): never {
  // Point at the configured app URL so this also works behind reverse proxies.
  const searchParams = url.searchParams;
  searchParams.delete('id_token');
  searchParams.set('shopify-reload', `${config.appUrl}${url.pathname}?${searchParams.toString()}`);
  throw redirect(`${config.auth.patchSessionTokenPath}?${searchParams.toString()}`);
}

export function redirectWithAppBridgeHeaders(redirectUri: string): never {
  throw new Response(undefined, {
    status: 401,
    statusText: 'Unauthorized',
    headers: new Headers({ [REAUTH_URL_HEADER]: redirectUri }),
  });
}

export function respondToInvalidSessionToken({
  params,
  request,
  retryRequest = false,
}: {
  params: BasicParams;
  request: Request;
  retryRequest?: boolean;
}): never {
  const isDocumentRequest = !request.headers.get('authorization');
  if (isDocumentRequest) redirectToBouncePage({ config: params.config }, new URL(request.url));
  throw new Response(undefined, {
    status: 401,
    statusText: 'Unauthorized',
    headers: retryRequest ? RETRY_INVALID_SESSION_HEADER : {},
  });
}

export async function validateAdminSessionToken(
  params: BasicParams,
  request: Request,
  token: string | undefined | null,
) {
  const { api, logger } = params;
  let payload: Awaited<ReturnType<BasicParams['api']['session']['decodeSessionToken']>>;
  try {
    payload = await api.session.decodeSessionToken(token as string, {
      checkAudience: true,
    });
  } catch (error) {
    logger.debug(`Failed to validate session token: ${(error as Error).message}`, {
      shop: getShopFromRequest(request) ?? undefined,
    });
    return respondToInvalidSessionToken({ params, request, retryRequest: true });
  }

  if (typeof payload.dest !== 'string' || typeof payload.iss !== 'string' || !URL.canParse(payload.dest)) {
    return respondToInvalidSessionToken({ params, request });
  }
  const destination = new URL(payload.dest);
  if (
    destination.protocol !== 'https:' ||
    (payload.dest !== destination.origin && payload.dest !== `${destination.origin}/`) ||
    (payload.iss !== `${destination.origin}/admin` && payload.iss !== `${destination.host}/admin`)
  ) {
    return respondToInvalidSessionToken({ params, request });
  }
  return { payload, shop: destination.hostname };
}

export function validateShopAndHostParams(params: BasicParams, request: Request) {
  const { api, config, logger } = params;
  const url = new URL(request.url);
  const shop = api.utils.sanitizeShop(url.searchParams.get('shop') ?? '');
  const host = shop ? api.utils.sanitizeHost(url.searchParams.get('host') ?? '') : null;
  if (shop && host) return;

  if (url.pathname.endsWith(config.auth.loginPath)) {
    const message =
      `Detected call to authenticate.admin() from configured login path ('${config.auth.loginPath}'), ` +
      `please make sure to call login() from that route instead.`;
    logger.debug(message);
    throw new Response(message, { status: 500 });
  }
  logger.debug('Missing shop or host params, rendering App Bridge to retrieve session');
  renderAppBridge(params, request);
}

export async function ensureAppIsEmbeddedIfRequired(params: BasicParams, request: Request) {
  const { api, logger } = params;
  const url = new URL(request.url);
  if (url.searchParams.get('embedded') !== '1') {
    logger.debug('Request is outside Shopify Admin, redirecting to Shopify', {
      shop: url.searchParams.get('shop') ?? undefined,
    });
    throw redirect(await api.auth.getEmbeddedAppUrl({ rawRequest: request }));
  }
}

export function ensureSessionTokenSearchParamIfRequired(params: BasicParams, request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('embedded') === '1' && !url.searchParams.get('id_token')) {
    params.logger.debug('Missing session token in search params, going to bounce page', {
      shop: url.searchParams.get('shop') ?? undefined,
    });
    redirectToBouncePage(params, url);
  }
}

export function redirectToInstallPage(params: BasicParams, shop: string): never {
  const { api, config } = params;
  const cleanShop = api.utils.sanitizeShop(shop, true);
  const url = new URL(`https://${cleanShop}/admin/oauth/install`);
  url.search = new URLSearchParams({
    client_id: config.apiKey,
    scope: config.scopes?.toString() || '',
  }).toString();
  return redirectWithAppBridgeHeaders(url.href);
}

// ---------------------------------------------------------------------------------------------
// `redirect()` on the admin context

const ADMIN_REGEX = /^shopify:\/*admin\//i;
const EMBEDDED_PARAMS_TO_REMOVE = [
  'hmac',
  'locale',
  'protocol',
  'session',
  'id_token',
  'shop',
  'timestamp',
  'host',
  'embedded',
  'appLoadId',
];

export function redirectFactory(params: BasicParams, request: Request, shop: string) {
  const { config, logger } = params;
  return function redirectInAdmin(
    url: string,
    init?: number | (ResponseInit & { target?: '_self' | '_parent' | '_top' }),
  ): Response {
    const { searchParams } = new URL(request.url);
    let target = typeof init !== 'number' && init?.target ? init.target : undefined;
    let parsedUrl: URL;

    if (ADMIN_REGEX.test(url)) {
      const adminUrl = new URL(url);
      for (const param of EMBEDDED_PARAMS_TO_REMOVE) adminUrl.searchParams.delete(param);
      const adminPath = adminUrl.href.replace(ADMIN_REGEX, '/');
      parsedUrl = new URL(`https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}${adminPath}`);
      target ??= '_parent';
    } else {
      parsedUrl = new URL(url, config.appUrl);
      target ??= '_self';
    }
    logger.debug('Redirecting', { shop, url: parsedUrl.toString() });

    if (parsedUrl.origin === new URL(config.appUrl).origin) {
      searchParams.forEach((value, key) => {
        if (!parsedUrl.searchParams.has(key)) parsedUrl.searchParams.set(key, value);
      });
    }

    const hasToken = Boolean(getSessionTokenHeader(request));
    const isEmbedded = searchParams.get('embedded') === '1';
    const isBounce = hasToken && request.headers.has('X-Shopify-Bounce');
    const isData = hasToken && !isBounce && (!isEmbedded || request.method !== 'GET');

    if (target === '_self') {
      if (isBounce) renderAppBridge(params, request, { url: parsedUrl.toString(), target });
      return redirect(parsedUrl.toString(), typeof init === 'number' ? init : init);
    } else if (isData) {
      redirectWithAppBridgeHeaders(parsedUrl.toString());
    } else if (isEmbedded) {
      renderAppBridge(params, request, { url: parsedUrl.toString(), target });
    }
    return redirect(url, typeof init === 'number' ? init : init);
  };
}

export class IdempotentPromiseHandlerImpl {
  #identifiers = new Map<string, number>();
  static TTL_MS = 60_000;

  async handlePromise({ promiseFunction, identifier }: { promiseFunction: () => Promise<void>; identifier: string }) {
    try {
      if (!this.#identifiers.has(identifier)) {
        this.#identifiers.set(identifier, Date.now());
        await promiseFunction();
      }
    } finally {
      for (const [id, date] of this.#identifiers) {
        if (Date.now() - date > IdempotentPromiseHandlerImpl.TTL_MS) this.#identifiers.delete(id);
      }
    }
  }
}
