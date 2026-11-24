import { Session } from '@shopify/shopify-api';

import { BasicParams } from '../../types.ts';

import { graphqlClientFactory } from './graphql.ts';
import type { AdminApiContext } from './types.ts';

interface AdminClientOptions {
  params: BasicParams;
  session: Session;
  handleClientError?: (error: any) => Promise<void>;
}

export function adminClientFactory({ params, handleClientError, session }: AdminClientOptions): AdminApiContext {
  return {
    graphql: graphqlClientFactory({ params, session, handleClientError }),
  };
}
