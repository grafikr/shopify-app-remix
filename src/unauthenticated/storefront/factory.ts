import { SessionNotFoundError } from '../../errors.ts';
import { BasicParams } from '../../types.ts';
import { storefrontClientFactory } from '../../clients/storefront/index.ts';
import { ensureValidOfflineSession } from '../../helpers/index.ts';

import { UnauthenticatedStorefrontContext, GetUnauthenticatedStorefrontContext } from './types.ts';

export function unauthenticatedStorefrontContextFactory(params: BasicParams): GetUnauthenticatedStorefrontContext {
  return async (shop: string): Promise<UnauthenticatedStorefrontContext> => {
    const session = await ensureValidOfflineSession(params, shop);

    if (!session) {
      throw new SessionNotFoundError(
        `Could not find a session for shop ${shop} when creating unauthenticated storefront context`,
      );
    }

    return {
      session,
      storefront: storefrontClientFactory({ params, session }),
    };
  };
}
