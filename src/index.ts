import '@shopify/shopify-api/adapters/web-api';
import { setAbstractRuntimeString } from '@shopify/shopify-api/runtime';

setAbstractRuntimeString(() => {
  return `Remix`;
});

export {
  LogSeverity,
  DeliveryMethod,
  BillingInterval,
  BillingReplacementBehavior,
  ApiVersion,
  Session,
} from '@shopify/shopify-api';

export type { JwtPayload } from '@shopify/shopify-api';

export type * from './types-contexts.ts';
export type { ShopifyApp, LoginError } from './types.ts';
export { LoginErrorType, AppDistribution } from './types.ts';
export { shopifyApp } from './shopify-app.ts';
export * from './errors.ts';
export type { SessionStorage } from '@shopify/shopify-app-session-storage';
