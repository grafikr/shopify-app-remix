import { HttpResponseError, InvalidJwtError, type Session } from '@shopify/shopify-api';

import type { BasicParams } from './types.ts';

// Refresh expiring offline tokens that are within 5 minutes of expiry.
export const WITHIN_MILLISECONDS_OF_EXPIRY = 5 * 60 * 1000;

export class InvalidRefreshTokenResponse extends Response {
  constructor() {
    super(undefined, { status: 500, statusText: 'Internal Server Error' });
  }
}

async function refreshToken(params: BasicParams, shop: string, refreshToken: string) {
  try {
    const { session } = await params.api.auth.refreshToken({
      shop,
      refreshToken,
    });
    return session;
  } catch (error) {
    if (
      error instanceof InvalidJwtError ||
      (error instanceof HttpResponseError &&
        error.response.code === 400 &&
        (error.response.body as { error?: string } | undefined)?.error === 'invalid_subject_token')
    ) {
      throw error;
    }
    if (
      error instanceof HttpResponseError &&
      error.response.code === 401 &&
      (error.response.body as { error?: string } | undefined)?.error === 'invalid_request'
    ) {
      throw new InvalidRefreshTokenResponse();
    }
    throw new Response(undefined, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}

/** Loads the shop's offline session, refreshing it first when it is an expiring token near expiry. */
export async function ensureValidOfflineSession(params: BasicParams, shop: string): Promise<Session | undefined> {
  const { api, config, logger } = params;
  logger.debug('Loading offline session from session storage', { shop });
  const session = await config.sessionStorage.loadSession(api.session.getOfflineId(shop));
  if (!session) return undefined;

  if (
    config.future.expiringOfflineAccessTokens &&
    session.isExpired(WITHIN_MILLISECONDS_OF_EXPIRY) &&
    session.refreshToken
  ) {
    const refreshed = await refreshToken(params, shop, session.refreshToken);
    await config.sessionStorage.storeSession(refreshed);
    return refreshed;
  }
  return session;
}
