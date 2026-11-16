/**
 * Convert a company display name into a URL-safe workspace slug.
 * Keep this deterministic; the API repeats validation before persisting it.
 */
export function slugifyWorkspaceName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}
