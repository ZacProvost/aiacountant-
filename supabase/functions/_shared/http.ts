const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
} as const;

export interface ResponseOptions {
  status?: number;
  origin?: string | null;
  headers?: Record<string, string>;
}

export const jsonResponse = (payload: unknown, options: ResponseOptions = {}) => {
  const { status = 200, origin = 'null', headers = {} } = options;
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...BASE_HEADERS,
      'Access-Control-Allow-Origin': origin ?? 'null',
      ...headers,
    },
  });
};

export const noContentResponse = (options: ResponseOptions = {}) =>
  new Response(null, {
    status: options.status ?? 204,
    headers: {
      ...BASE_HEADERS,
      'Access-Control-Allow-Origin': options.origin ?? 'null',
      ...(options.headers ?? {}),
    },
  });

export const handleOptions = (origin: string | null) =>
  noContentResponse({
    origin,
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });





