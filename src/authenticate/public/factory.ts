import { BasicParams } from '../../types.ts';

import { authenticateCheckoutFactory } from './checkout/authenticate.ts';
import { authenticateAppProxyFactory } from './appProxy/authenticate.ts';
import { authenticateCustomerAccountFactory } from './customer-account/authenticate.ts';
import { AuthenticatePublic } from './types.ts';

export function authenticatePublicFactory(params: BasicParams) {
  const authenticateCheckout = authenticateCheckoutFactory(params);
  const authenticateAppProxy = authenticateAppProxyFactory(params);
  const authenticateCustomerAccount = authenticateCustomerAccountFactory(params);

  const context: AuthenticatePublic = {
    checkout: authenticateCheckout,
    appProxy: authenticateAppProxy,
    customerAccount: authenticateCustomerAccount,
  };

  return context;
}
