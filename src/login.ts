import { redirect } from './helpers.ts';
import { type BasicParams, type LoginError, LoginErrorType } from './types.ts';

/**
 * `login(request)`: reads `shop` from the query string or form body. Returns `{ shop: LoginErrorType }`
 * when missing or invalid, `{}` for an empty GET, and otherwise throws a redirect to the install page.
 */
export function loginFactory({ api, config, logger }: BasicParams) {
  return async function login(request: Request): Promise<LoginError> {
    const url = new URL(request.url);
    const shopParam = url.searchParams.get('shop');

    if (request.method === 'GET' && !shopParam) return {};

    const shop = shopParam || ((await request.formData()).get('shop') as string | null);
    if (!shop) {
      logger.debug('Missing shop parameter', { shop });
      return { shop: LoginErrorType.MissingShop };
    }

    const shopWithoutProtocol = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const shopWithDomain = shop.indexOf('.') === -1 ? `${shopWithoutProtocol}.myshopify.com` : shopWithoutProtocol;
    const sanitizedShop = api.utils.sanitizeShop(shopWithDomain);
    if (!sanitizedShop) {
      logger.debug('Invalid shop parameter', { shop });
      return { shop: LoginErrorType.InvalidShop };
    }

    const adminPath = api.utils.legacyUrlToShopAdminUrl(sanitizedShop);
    const redirectUrl = `https://${adminPath}/oauth/install?client_id=${config.apiKey}`;
    logger.info(`Redirecting login request to ${redirectUrl}`, {
      shop: sanitizedShop,
    });
    throw redirect(redirectUrl);
  };
}
