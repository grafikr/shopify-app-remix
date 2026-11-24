import { Session } from '@shopify/shopify-api';

import type { BasicParams } from '../../../types.ts';
import { AuthorizationStrategy } from '../strategies/types.ts';

import { createAdminApiContext } from './create-admin-api-context.ts';

export async function triggerAfterAuthHook(
  params: BasicParams,
  session: Session,
  request: Request,
  authStrategy: AuthorizationStrategy,
) {
  const { config, logger } = params;
  if (config.hooks.afterAuth) {
    logger.info('Running afterAuth hook', { shop: session.shop });

    const admin = createAdminApiContext(session, params, authStrategy.handleClientError(request));

    await config.hooks.afterAuth({
      session,
      admin,
    });
  }
}
