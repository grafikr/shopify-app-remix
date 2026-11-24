import { BillingRequestResponseObject, HttpResponseError, Session } from '@shopify/shopify-api';

import { AppConfigArg } from '../../../config-types.ts';
import { BasicParams } from '../../../types.ts';
import { invalidateAccessToken, respondToInvalidSessionToken } from '../../helpers/index.ts';

import { redirectOutOfApp } from './helpers.ts';
import type { RequestBillingOptions } from './types.ts';

export function requestBillingFactory<Config extends AppConfigArg>(
  params: BasicParams,
  request: Request,
  session: Session,
) {
  return async function requestBilling({
    plan,
    isTest,
    returnUrl,
    ...overrides
  }: RequestBillingOptions<Config>): Promise<never> {
    const { api, logger } = params;

    logger.info('Requesting billing', {
      shop: session.shop,
      plan,
      isTest,
      returnUrl,
    });

    let result: BillingRequestResponseObject;
    try {
      result = await api.billing.request({
        plan: plan as string,
        session,
        isTest,
        returnUrl,
        returnObject: true,
        ...overrides,
      });
    } catch (error) {
      if (error instanceof HttpResponseError && error.response.code === 401) {
        logger.debug('API token was invalid, responding to invalid session', {
          shop: session.shop,
        });

        await invalidateAccessToken(params, session);

        throw respondToInvalidSessionToken({
          params,
          request,
          retryRequest: true,
        });
      }
      throw error;
    }

    throw redirectOutOfApp(params, request, result.confirmationUrl, session.shop);
  };
}
