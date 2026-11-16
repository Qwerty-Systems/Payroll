import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignInPage from './SignInPage';

const auth = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: false,
  user: undefined as { email?: string; name?: string } | undefined,
  error: undefined as { message: string } | undefined,
  loginWithRedirect: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => auth }));
vi.mock('../config', () => ({ auth0Configured: true }));

describe('SignInPage', () => {
  beforeEach(() => {
    auth.isLoading = false;
    auth.isAuthenticated = false;
    auth.user = undefined;
    auth.error = undefined;
    auth.loginWithRedirect.mockReset().mockResolvedValue(undefined);
    auth.logout.mockReset().mockResolvedValue(undefined);
  });

  it('starts Google login with a safe application return path', () => {
    render(<SignInPage />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(auth.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/app' },
      authorizationParams: { connection: 'google-oauth2' },
    });
  });

  it('shows Auth0 errors instead of silently restarting login', () => {
    auth.error = { message: 'Unable to complete the authentication transaction.' };
    render(<SignInPage />);
    expect(screen.getByText(/unable to complete the authentication transaction/i)).toBeInTheDocument();
    expect(auth.loginWithRedirect).not.toHaveBeenCalled();
  });

  it('disables sign-in while the SDK is processing a session', () => {
    auth.isLoading = true;
    render(<SignInPage />);
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
  });
});
