// This file contains types we want to export to make it easier for apps to pass the contexts we return as types

import type { AppConfigArg } from './config-types.ts';
import type { ShopifyApp } from './types.ts';
import type { AdminContext as IAdminContext } from './authenticate/admin/types.ts';
import type { WebhookContext as IWebhookContext } from './authenticate/webhooks/types.ts';
import type {
  AppProxyContext as IAppProxyContext,
  AppProxyContextWithSession as IAppProxyContextWithSession,
} from './authenticate/public/appProxy/types.ts';
import type { AdminApiContext as IAdminApiContext, StorefrontContext as IStorefrontContext } from './clients/index.ts';

// Direct re-exports for types without transformations
export type { UnauthenticatedAdminContext } from './unauthenticated/admin/types.ts';
export type { UnauthenticatedStorefrontContext } from './unauthenticated/storefront/types.ts';
export type { FlowContext } from './authenticate/flow/types.ts';
export type { FulfillmentServiceContext } from './authenticate/fulfillment-service/types.ts';
export type { ScopesDetail } from './authenticate/admin/scope/types.ts';
export type { AdminApiContext } from './clients/index.ts';
export type { ScopesContext } from './authenticate/admin/types.ts';
export type { CheckoutContext } from './authenticate/public/checkout/types.ts';
export type { CustomerAccountContext } from './authenticate/public/customer-account/types.ts';
export type { StorefrontContext as StorefrontApiContext } from './clients/index.ts';
export type { POSContext } from './authenticate/pos/types.ts';

type ShopifyConfig<App> = App extends ShopifyApp<infer Config extends AppConfigArg> ? Config : never;

type DefaultApp = ShopifyApp<AppConfigArg>;

// Types that need transformations or generic parameters
export type AdminContext<App = DefaultApp> = IAdminContext<ShopifyConfig<App>>;

// Types that need modifications
export type AppProxyContext = IAppProxyContext | IAppProxyContextWithSession;

export type WebhookContext = IWebhookContext<string>;

// Extra types for API contexts
export type AdminGraphqlClient = IAdminApiContext['graphql'];

export type StorefrontGraphqlClient = IStorefrontContext['graphql'];
