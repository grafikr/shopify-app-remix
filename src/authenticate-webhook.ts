import { WebhookValidationErrorReason } from '@shopify/shopify-api';

import { createAdminApiContext, handleClientErrorFactory } from './admin-client.ts';
import { ensureValidOfflineSession, InvalidRefreshTokenResponse } from './sessions.ts';
import type { BasicParams, WebhookContext } from './types.ts';

/** `authenticate.webhook(request)`: validates the HMAC and returns the parsed webhook. Throws 400/401/405. */
export function authenticateWebhookFactory(params: BasicParams) {
  const { api, logger } = params;

  return async function authenticateWebhook(request: Request): Promise<WebhookContext> {
    if (request.method !== 'POST') {
      logger.debug('Received a non-POST request for a webhook. Only POST requests are allowed.', {
        url: request.url,
        method: request.method,
      });
      throw new Response(undefined, {
        status: 405,
        statusText: 'Method not allowed',
      });
    }

    const rawBody = await request.text();
    const check = await api.webhooks.validate({ rawBody, rawRequest: request });

    if (!check.valid) {
      if (check.reason === WebhookValidationErrorReason.InvalidHmac) {
        logger.debug('Webhook HMAC validation failed', { ...check });
        throw new Response(undefined, {
          status: 401,
          statusText: 'Unauthorized',
        });
      }
      logger.debug('Webhook validation failed', { ...check });
      throw new Response(undefined, { status: 400, statusText: 'Bad Request' });
    }

    let session: Awaited<ReturnType<typeof ensureValidOfflineSession>>;
    try {
      session = await ensureValidOfflineSession(params, check.domain);
    } catch (error) {
      if (!(error instanceof InvalidRefreshTokenResponse)) throw error;
      logger.info('Offline session refresh failed during webhook authentication', {
        shop: check.domain,
      });
    }

    const { domain, hmac: _hmac, ...fields } = check;
    const context = {
      ...fields,
      shop: domain,
      payload: JSON.parse(rawBody),
      session: undefined,
      admin: undefined,
    } as WebhookContext;

    if (!session) return context;
    return {
      ...context,
      session,
      admin: createAdminApiContext(session, params, handleClientErrorFactory({ request })),
    };
  };
}
