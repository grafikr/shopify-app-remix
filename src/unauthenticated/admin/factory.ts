import { ensureValidOfflineSession } from '../../helpers/index.ts';
import { SessionNotFoundError } from '../../errors.ts';
import { BasicParams } from '../../types.ts';
import { adminClientFactory } from '../../clients/admin/index.ts';

import { UnauthenticatedAdminContext } from './types.ts';

export function unauthenticatedAdminContextFactory(params: BasicParams) {
  return async (shop: string): Promise<UnauthenticatedAdminContext> => {
    const session = await ensureValidOfflineSession(params, shop);

    if (!session) {
      throw new SessionNotFoundError(
        `Could not find a session for shop ${shop} when creating unauthenticated admin context`,
      );
    }

    return {
      session,
      admin: adminClientFactory({ params, session }),
    };
  };
}
