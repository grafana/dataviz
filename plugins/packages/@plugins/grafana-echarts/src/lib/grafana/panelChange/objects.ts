// The object helpers of the adapters.

/** A plain object: not `null` and not an array. */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A copy of each present key of `from` in `keys`. */
export const pick = (from: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => from[key] !== undefined).map((key) => [key, structuredClone(from[key])]));
