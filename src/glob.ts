const cache = new Map<string, RegExp>();

export function globMatch(pattern: string, value: string | undefined): boolean {
  if (value === undefined) return false;
  let regex = cache.get(pattern);
  if (!regex) {
    const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\?/g, '.');
    regex = new RegExp(`^${escaped}$`);
    if (cache.size > 10_000) cache.clear();
    cache.set(pattern, regex);
  }
  return regex.test(value);
}
