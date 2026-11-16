/**
 * Normalize a supplied workspace slug, or derive one from the company name.
 * Supplied slugs are validated rather than silently rewritten.
 */
export function resolveWorkspaceSlug(slug: string | undefined, displayName: string): string {
  const candidate = (slug?.trim() || displayName)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) || candidate.length < 3) {
    throw new Error('Workspace slug must contain 3–63 lowercase letters, numbers or hyphen-separated segments.');
  }

  return candidate;
}
