import type { BasicParams } from '../../../types.ts';
import { authenticateExtensionFactory } from '../extension/authenticate.ts';

import type { AuthenticateCheckout } from './types.ts';

export function authenticateCheckoutFactory(params: BasicParams): AuthenticateCheckout {
  return authenticateExtensionFactory(params, 'checkout') as AuthenticateCheckout;
}
