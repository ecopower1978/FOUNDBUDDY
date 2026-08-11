export function demoteNestedH1<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => demoteNestedH1(item)) as T
  }
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      key === 'tag' && child === 'h1' ? 'h2' : demoteNestedH1(child),
    ]),
  ) as T
}
