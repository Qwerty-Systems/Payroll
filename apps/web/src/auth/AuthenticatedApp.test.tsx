import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthenticatedApp from './AuthenticatedApp';

const auth = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: false,
  user: undefined as { email?: string; name?: string } | undefined,
  error: undefined as { message: string } | undefined,
  getAccessTokenSilently: vi.fn(),
  loginWithRedirect: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => auth }));
vi.mock('../config', () => ({
  auth0Config: { apiBaseUrl: 'https://api.example.test', audience: 'https://api.example.test' },
}));

describe('AuthenticatedApp', () => {
  beforeEach(() => {
    auth.isLoading = false;
    auth.isAuthenticated = false;
    auth.user = undefined;
    auth.error = undefined;
    auth.getAccessTokenSilently.mockReset().mockResolvedValue('test-access-token');
    auth.loginWithRedirect.mockReset().mockResolvedValue(undefined);
    auth.logout.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('initiates one Google redirect when no authenticated session exists', async () => {
    const { rerender } = render(<AuthenticatedApp />);
    await waitFor(() => expect(auth.loginWithRedirect).toHaveBeenCalledTimes(1));
    rerender(<AuthenticatedApp />);
    expect(auth.loginWithRedirect).toHaveBeenCalledTimes(1);
    expect(auth.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/app' },
      authorizationParams: { connection: 'google-oauth2' },
    });
  });

  it('loads the authenticated API profile with a bearer token', async () => {
    auth.isAuthenticated = true;
    auth.user = { email: 'payroll@example.test', name: 'Payroll Admin' };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        provisioned: true,
        memberships: [{
          tenantId: 'tenant-1',
          slug: 'example-company',
          displayName: 'Example Company',
          legalName: 'Example Company Limited',
          tenantStatus: 'trial',
          membershipId: 'membership-1',
          role: 'owner',
        }],
      }),
    } as Response);

    render(<AuthenticatedApp />);

    await waitFor(() => expect(screen.getByText(/api authentication succeeded/i)).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
      }),
    );
    expect(screen.getByText('Example Company')).toBeInTheDocument();
    expect(screen.getByText(/owner workspace/i)).toBeInTheDocument();
    expect(screen.getByText('trial')).toBeInTheDocument();
  });

  it('generates a workspace slug from the display name and preserves a manual edit', async () => {
    auth.isAuthenticated = true;
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, provisioned: false, identity: { email: 'owner@example.test' }, memberships: [] }),
    } as Response);

    render(<AuthenticatedApp />);
    await screen.findByText(/your identity is ready for company setup/i);

    const displayName = screen.getByLabelText(/display name/i);
    const slug = screen.getByLabelText(/workspace url slug/i);

    fireEvent.change(displayName, { target: { value: 'Test Company' } });
    expect(slug).toHaveValue('test-company');
    fireEvent.change(slug, { target: { value: 'custom-workspace' } });
    fireEvent.change(displayName, { target: { value: 'Another Company' } });
    expect(slug).toHaveValue('custom-workspace');
  });

  it('shows an actionable message when the API rejects the access token', async () => {
    auth.isAuthenticated = true;
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);

    render(<AuthenticatedApp />);

    await waitFor(() => expect(screen.getByText(/verify its issuer and audience/i)).toBeInTheDocument());
  });
});
