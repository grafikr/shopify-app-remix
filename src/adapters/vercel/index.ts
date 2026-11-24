import { setAbstractFetchFunc } from '@shopify/shopify-api/runtime';

import '../node/index.ts';

// Remix 3 runs on web-standard globals, so unlike upstream there's no `installGlobals()` call.
// Capture the global fetch at import time so later patches by the platform (e.g. Vercel's
// instrumentation) don't change which implementation the API client uses.
const fetchFunc = fetch;
setAbstractFetchFunc(async (...args) => {
  const response = await fetchFunc(...args);

  return response as any;
});
