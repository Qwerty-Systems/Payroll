import { describe, expect, it } from 'vitest';
import { slugifyWorkspaceName } from './workspace-slug';

describe('slugifyWorkspaceName', () => {
  it('converts company names into lowercase URL-safe slugs', () => {
    expect(slugifyWorkspaceName('Test Company')).toBe('test-company');
    expect(slugifyWorkspaceName('Qwerty Systems Ltd')).toBe('qwerty-systems-ltd');
    expect(slugifyWorkspaceName('My Company 2026')).toBe('my-company-2026');
  });

  it('normalizes accents and repeated separators', () => {
    expect(slugifyWorkspaceName('  Café   &  Sons  ')).toBe('cafe-sons');
  });

  it('limits generated slugs to 63 characters', () => {
    expect(slugifyWorkspaceName('a'.repeat(80))).toHaveLength(63);
  });
});
