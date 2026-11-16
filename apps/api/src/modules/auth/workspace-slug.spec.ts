import { resolveWorkspaceSlug } from './workspace-slug';

describe('resolveWorkspaceSlug', () => {
  it('uses a supplied valid slug', () => {
    expect(resolveWorkspaceSlug('Test-Company', 'Ignored Name')).toBe('test-company');
  });

  it('derives a slug when the client omits it', () => {
    expect(resolveWorkspaceSlug(undefined, 'Test Company')).toBe('test-company');
  });

  it('rejects names that cannot produce a valid slug', () => {
    expect(() => resolveWorkspaceSlug(undefined, '東京')).toThrow(/Workspace slug must contain/);
  });
});
