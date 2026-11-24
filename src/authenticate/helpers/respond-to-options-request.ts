import { BasicParams } from '../../types.ts';

import { ensureCORSHeadersFactory } from './ensure-cors-headers.ts';

export function respondToOptionsRequest(params: BasicParams, request: Request, corsHeaders?: string[]) {
  if (request.method === 'OPTIONS') {
    const ensureCORSHeaders = ensureCORSHeadersFactory(params, request, corsHeaders);

    throw ensureCORSHeaders(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Max-Age': '7200',
        },
      }),
    );
  }
}
