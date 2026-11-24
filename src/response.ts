/**
 * Equivalent of `redirect()` from `react-router` / `@remix-run/node`: a `Response` with a `Location` header.
 * Built by hand so the headers stay mutable (unlike `Response.redirect`), which lets CORS headers be added later.
 */
export function redirect(url: string, init?: number | ResponseInit): Response {
  const options: ResponseInit = typeof init === 'number' ? { status: init } : (init ?? {});
  const headers = new Headers(options.headers);
  headers.set('Location', url);
  return new Response(null, { status: 302, ...options, headers });
}
