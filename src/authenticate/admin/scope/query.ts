import { AuthScopes, Session } from '@shopify/shopify-api';

import { AdminApiContext } from '../../../clients/index.ts';
import type { BasicParams } from '../../../types.ts';

import { ScopesDetail } from './types.ts';
import { FetchScopesDetailResponse, fetchScopeDetail } from './client/fetch-scopes-details.ts';

export function queryScopesFactory(params: BasicParams, session: Session, admin: AdminApiContext) {
  return async function queryScopes() {
    const { logger } = params;

    logger.debug('Querying scopes details: ', {
      shop: session.shop,
    });

    const scopesDetail = await fetchScopeDetail(admin);
    return mapFetchScopeDetail(scopesDetail);
  };
}

export function mapFetchScopeDetail(scopesDetailResponse: FetchScopesDetailResponse): ScopesDetail {
  const appInformation = scopesDetailResponse.app;

  const granted = new AuthScopes(appInformation.installation.accessScopes.map((scope) => scope.handle)).toArray(true);

  const required = new AuthScopes(appInformation.requestedAccessScopes.map((scope) => scope.handle)).toArray(true);

  const optional = new AuthScopes(appInformation.optionalAccessScopes.map((scope) => scope.handle)).toArray(true);

  return {
    granted,
    required,
    optional,
  };
}
