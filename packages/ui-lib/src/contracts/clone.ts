/** Clone JSON-shaped contract data, including Vue proxies, preserving absent/undefined values.
 * Unlike structuredClone this does not reject reactive proxy wrappers.
 */
export function cloneData<T>(value: T): T {
  if (Array.isArray(value))
    return (value as unknown[]).map(item => cloneData(item)) as T
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, cloneData(item),
    ])) as T
  return value
}
