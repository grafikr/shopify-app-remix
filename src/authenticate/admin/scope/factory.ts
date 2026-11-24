import { Session } from '@shopify/shopify-api';

import { BasicParams } from '../../../types.ts';
import { AdminApiContext } from '../../../clients/index.ts';

import { ScopesApiContext } from './types.ts';
import { requestScopesFactory } from './request.ts';
import { queryScopesFactory } from './query.ts';
import { revokeScopesFactory } from './revoke.ts';

export function scopesApiFactory(params: BasicParams, session: Session, admin: AdminApiContext): ScopesApiContext {
  return {
    query: queryScopesFactory(params, session, admin),
    request: requestScopesFactory(params, session, admin),
    revoke: revokeScopesFactory(params, session, admin),
  };
}
