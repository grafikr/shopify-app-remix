import { BasicParams } from '../../../types.ts';
import { authenticateExtensionFactory } from '../extension/authenticate.ts';

import { AuthenticateCustomerAccount } from './types.ts';

export function authenticateCustomerAccountFactory(params: BasicParams): AuthenticateCustomerAccount {
  return authenticateExtensionFactory(params, 'customer account') as AuthenticateCustomerAccount;
}
