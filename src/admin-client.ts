import { HttpResponseError, type Session } from '@shopify/shopify-api';

import type { AdminApiContext, BasicParams, HandleClientError } from './types.ts';

export function createAdminApiContext(
  session: Session,
  params: BasicParams,
  handleClientError?: HandleClientError,
): AdminApiContext {
  return {
    async graphql(query, options) {
      const client = new params.api.clients.Graphql({
        session,
        apiVersion: options?.apiVersion,
      });
      try {
        const apiResponse = await client.request(query, {
          variables: options?.variables,
          retries: options?.tries ? options.tries - 1 : 0,
          headers: options?.headers,
          signal: options?.signal,
        });

        return new Response(JSON.stringify(apiResponse)) as never;
      } catch (error) {
        if (handleClientError) {
          throw await handleClientError({ error, params, session });
        }

        throw error;
      }
    },
  };
}

export function handleClientErrorFactory({
  request,
  onError,
}: {
  request: Request;
  onError?: (args: { request: Request; session: Session; error: HttpResponseError }) => Promise<void>;
}): HandleClientError {
  return async function handleClientError({ error, params, session }) {
    if (!(error instanceof HttpResponseError)) {
      params.logger.debug(`Got a response error from the API: ${(error as Error).message}`, {
        shop: session.shop,
      });
      throw error;
    }

    params.logger.debug(`Got an HTTP response error from the API: ${error.message}`, {
      shop: session.shop,
      code: error.response.code,
      statusText: error.response.statusText,
      body: JSON.stringify(error.response.body),
    });

    if (onError) {
      await onError({ request, session, error });
    }

    // Forward a minimal copy of the upstream HTTP response instead of an Error.
    throw new Response(JSON.stringify(error.response.body), {
      status: error.response.code,
      headers: {
        'Content-Type': error.response.headers['Content-Type'] as string,
      },
    });
  };
}
