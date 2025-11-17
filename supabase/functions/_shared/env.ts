const cache = new Map<string, string>();

const normalizeKey = (key: string) => key.trim().toUpperCase();

export const getEnvVar = (key: string, options: { optional?: boolean } = {}): string => {
  const normalizedKey = normalizeKey(key);
  if (cache.has(normalizedKey)) {
    return cache.get(normalizedKey)!;
  }

  const value = Deno.env.get(normalizedKey);
  if (!value || value.trim().length === 0) {
    if (options.optional) {
      return '';
    }
    throw new Error(`Missing required environment variable "${normalizedKey}"`);
  }

  const trimmedValue = value.trim();
  cache.set(normalizedKey, trimmedValue);
  return trimmedValue;
};

export const getOptionalEnvVar = (key: string): string | null => {
  try {
    const value = getEnvVar(key, { optional: true });
    return value.length ? value : null;
  } catch {
    return null;
  }
};





