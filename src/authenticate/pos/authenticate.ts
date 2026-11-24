import { BasicParams } from '../../types.ts';
import { authenticateExtensionFactory } from '../public/extension/authenticate.ts';

import type { AuthenticatePOS } from './types.ts';

export function authenticatePOSFactory(params: BasicParams): AuthenticatePOS {
  return authenticateExtensionFactory(params, 'pos') as AuthenticatePOS;
}
