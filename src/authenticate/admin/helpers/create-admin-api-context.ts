import { Session } from '@shopify/shopify-api';

import type { BasicParams } from '../../../types.ts';
import { AdminApiContext, HandleAdminClientError, adminClientFactory } from '../../../clients/admin/index.ts';

export function createAdminApiContext(
  session: Session,
  params: BasicParams,
  handleClientError: HandleAdminClientError,
): AdminApiContext {
  return adminClientFactory({
    session,
    params,
    handleClientError,
  });
}
