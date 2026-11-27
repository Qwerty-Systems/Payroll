import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TenantWorkspace from './TenantWorkspace';

vi.mock('@mui/material', async importOriginal => {
  const actual = await importOriginal<typeof import('@mui/material')>();
  return { ...actual, useMediaQuery: () => true };
});

vi.mock('../offline/use-auto-sync', () => ({ useAutoSync: vi.fn() }));
vi.mock('./TenantAdministration', () => ({ default: () => null }));
vi.mock('./SyncReviewDialog', () => ({ default: () => null }));
vi.mock('./ComplianceWorkspace', () => ({ default: () => null }));
vi.mock('./OrganizationWorkspace', () => ({ default: () => null }));
vi.mock('./WorkforceTimeWorkspace', () => ({ default: () => null }));
vi.mock('./PayrollWorkspace', () => ({ default: () => null }));
vi.mock('./IntegrationsWorkspace', () => ({ default: () => null }));

describe('TenantWorkspace mobile navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response));
  });

  it('opens the mobile drawer with an accessible close action', async () => {
    render(
      <TenantWorkspace
        memberships={[{
          tenantId: 'tenant-1',
          slug: 'example-company',
          displayName: 'Example Company',
          legalName: 'Example Company Limited',
          tenantStatus: 'trial',
          membershipId: 'membership-1',
          role: 'owner',
        }]}
        userName="Payroll Admin"
        apiBaseUrl="https://api.example.test"
        getToken={async () => 'test-access-token'}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(13));
    await waitFor(() => expect(screen.queryByText('Refreshing workspace data…')).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
  });
});
