const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
] as const;

const parseOrigins = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const allowedOrigins = parseOrigins(Deno.env.get('AI_PROXY_ALLOWED_ORIGINS'));

export const resolveAllowedOrigin = (originHeader: string | null): string | null => {
  if (!originHeader) {
    return null;
  }
  if (allowedOrigins.length === 0) {
    return DEFAULT_ALLOWED_ORIGINS.includes(originHeader as (typeof DEFAULT_ALLOWED_ORIGINS)[number])
      ? originHeader
      : null;
  }
  return allowedOrigins.includes(originHeader) ? originHeader : null;
};

