import { BasicParams } from '../types.ts';

import { createOrLoadOfflineSession } from './create-or-load-offline-session.ts';
import { ensureOfflineTokenIsNotExpired } from './ensure-offline-token-is-not-expired.ts';

export async function ensureValidOfflineSession(params: BasicParams, shop: string) {
  const session = await createOrLoadOfflineSession(params, shop);

  if (!session) return undefined;

  return ensureOfflineTokenIsNotExpired(session, params, shop);
}
