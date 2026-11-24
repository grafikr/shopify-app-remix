import { HttpResponseError, InvalidJwtError, RequestedTokenType, type Session } from '@shopify/shopify-api';

import { createAdminApiContext, handleClientErrorFactory } from './admin-client.ts';
import {
  ensureAppIsEmbeddedIfRequired,
  ensureCORSHeadersFactory,
  ensureSessionTokenSearchParamIfRequired,
  getSessionTokenFromUrlParam,
  getSessionTokenHeader,
  getShopFromRequest,
  isTrustedExitIframeDestination,
  redirectFactory,
  renderAppBridge,
  respondToBotRequest,
  respondToInvalidSessionToken,
  respondToOptionsRequest,
  validateAdminSessionToken,
  validateShopAndHostParams,
} from './helpers.ts';
import { WITHIN_MILLISECONDS_OF_EXPIRY } from './sessions.ts';
import type { AdminContext, BasicParams } from './types.ts';

/**
 * `authenticate.admin(request)`: validates the session token (header, or `id_token` param on document
 * loads), exchanges it for an access token when no valid session is stored, and returns the admin context.
 * Redirects, the App Bridge bounce page and 401s are signalled by throwing a `Response`.
 */
export function authenticateAdminFactory(params: BasicParams) {
  const { api, config, logger } = params;

  function handleClientError(request: Request) {
    return handleClientErrorFactory({
      request,
      onError: async ({ session, error }: { session: Session; error: HttpResponseError }) => {
        if (error.response.code === 401) {
          logger.debug('Responding to invalid access token', {
            shop: getShopFromRequest(request) ?? undefined,
          });
          session.accessToken = undefined;
          await config.sessionStorage.storeSession(session);
          respondToInvalidSessionToken({ params, request });
        }
      },
    });
  }

  async function exchangeToken(
    request: Request,
    shop: string,
    sessionToken: string,
    requestedTokenType: RequestedTokenType,
  ) {
    try {
      return await api.auth.tokenExchange({
        sessionToken,
        shop,
        requestedTokenType,
        expiring: config.future.expiringOfflineAccessTokens,
      });
    } catch (error) {
      if (
        error instanceof InvalidJwtError ||
        (error instanceof HttpResponseError &&
          error.response.code === 400 &&
          (error.response.body as { error?: string } | undefined)?.error === 'invalid_subject_token')
      ) {
        return respondToInvalidSessionToken({
          params,
          request,
          retryRequest: true,
        });
      }
      throw new Response(undefined, {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
  }

  async function getSession(request: Request, existing: Session | undefined, shop: string, sessionToken: string) {
    if (existing?.isActive(undefined, WITHIN_MILLISECONDS_OF_EXPIRY)) return existing;

    logger.info('No valid session found, requesting offline access token', {
      shop,
    });
    const { session: offline } = await exchangeToken(
      request,
      shop,
      sessionToken,
      RequestedTokenType.OfflineAccessToken,
    );
    await config.sessionStorage.storeSession(offline);
    let session = offline;

    if (config.useOnlineTokens) {
      logger.info('Requesting online access token', { shop });
      const { session: online } = await exchangeToken(
        request,
        shop,
        sessionToken,
        RequestedTokenType.OnlineAccessToken,
      );
      await config.sessionStorage.storeSession(online);
      session = online;
    }

    try {
      await config.idempotentPromiseHandler.handlePromise({
        identifier: sessionToken,
        promiseFunction: async () => {
          if (!config.hooks.afterAuth) return;
          logger.info('Running afterAuth hook', { shop: session.shop });
          await config.hooks.afterAuth({
            session,
            admin: createAdminApiContext(session, params, handleClientError(request)),
          });
        },
      });
    } catch (errorOrResponse) {
      if (errorOrResponse instanceof Response) throw errorOrResponse;
      throw new Response(undefined, {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
    return session;
  }

  return async function authenticateAdmin(request: Request): Promise<AdminContext> {
    try {
      respondToBotRequest(params, request);
      respondToOptionsRequest(params, request);

      // Bounce page: renders App Bridge, which fetches a token and reloads `shopify-reload`.
      const url = new URL(request.url);
      if (url.pathname.endsWith(config.auth.patchSessionTokenPath)) {
        logger.debug('Rendering bounce page', {
          shop: getShopFromRequest(request) ?? undefined,
        });
        renderAppBridge(params, request);
      }
      if (url.pathname.endsWith(config.auth.exitIframePath)) {
        const destination = url.searchParams.get('exitIframe');
        if (!isTrustedExitIframeDestination(config.appUrl, destination)) {
          logger.warning('Rejected exit-iframe redirect to an untrusted destination', {
            shop: getShopFromRequest(request) ?? undefined,
            destination: destination ?? undefined,
          });
          throw new Error('Invalid exit-iframe destination. Refusing to redirect.');
        }
        renderAppBridge(params, request, { url: destination as string });
      }

      // A request without a session token header is a document request: make sure we're embedded
      // and have what we need to load the session.
      if (!getSessionTokenHeader(request)) {
        validateShopAndHostParams(params, request);
        await ensureAppIsEmbeddedIfRequired(params, request);
        ensureSessionTokenSearchParamIfRequired(params, request);
      }

      const sessionToken = (getSessionTokenHeader(request) || getSessionTokenFromUrlParam(request)) as string;
      const { payload, shop } = await validateAdminSessionToken(params, request, sessionToken);
      logger.info('Authenticating admin request', { shop });

      const sessionId = config.useOnlineTokens
        ? api.session.getJwtSessionId(shop, payload.sub)
        : api.session.getOfflineId(shop);
      const existing = await config.sessionStorage.loadSession(sessionId);
      const session = await getSession(request, existing, shop, sessionToken);

      return {
        admin: createAdminApiContext(session, params, handleClientError(request)),
        session,
        sessionToken: payload,
        cors: ensureCORSHeadersFactory(params, request),
        redirect: redirectFactory(params, request, session.shop),
      };
    } catch (errorOrResponse) {
      if (errorOrResponse instanceof Response) {
        ensureCORSHeadersFactory(params, request)(errorOrResponse);
      }
      throw errorOrResponse;
    }
  };
}
