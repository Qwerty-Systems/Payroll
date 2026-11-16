import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import {
  Alert, Avatar, Box, Button, CircularProgress, Container, Divider,
  Paper, Stack, Typography,
} from '@mui/material';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import VerifiedUserRounded from '@mui/icons-material/VerifiedUserRounded';
import ApiRounded from '@mui/icons-material/ApiRounded';
import { auth0Config } from '../config';
import { navigateTo } from '../navigation';

type ApiIdentity = {
  auth0Subject?: string;
  email?: string | null;
  emailVerified?: boolean;
  name?: string | null;
  picture?: string | null;
};

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; identity: ApiIdentity }
  | { status: 'error'; message: string };

function LoadingScreen({ message }: { message: string }) {
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#F7F5EF', p: 3 }}>
    <Stack alignItems="center" spacing={2}>
      <CircularProgress />
      <Typography color="text.secondary">{message}</Typography>
    </Stack>
  </Box>;
}

export default function AuthenticatedApp() {
  const {
    isLoading, isAuthenticated, user, error: authError,
    getAccessTokenSilently, loginWithRedirect, logout,
  } = useAuth0();
  const redirectStarted = useRef(false);
  const [apiState, setApiState] = useState<ApiState>({ status: 'loading' });

  useEffect(() => {
    if (isLoading || isAuthenticated || redirectStarted.current) return;
    redirectStarted.current = true;
    void loginWithRedirect({
      appState: { returnTo: '/app' },
      authorizationParams: { connection: 'google-oauth2' },
    }).catch(() => { redirectStarted.current = false; });
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const controller = new AbortController();

    async function loadIdentity() {
      try {
        if (!auth0Config.apiBaseUrl) throw new Error('The API base URL is not configured for this deployment.');
        const accessToken = await getAccessTokenSilently();
        const apiBase = auth0Config.apiBaseUrl.replace(/\/+$/, '');
        const response = await fetch(`${apiBase}/api/v1/auth/me`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) {
          const message = response.status === 401
            ? 'The API rejected the access token. Verify the API issuer and audience configuration.'
            : response.status === 403
              ? 'The API denied access to the authenticated identity.'
              : `The JengaFlow API returned HTTP ${response.status}.`;
          throw new Error(message);
        }
        const identity = await response.json() as ApiIdentity;
        if (!identity.auth0Subject) throw new Error('The API response did not contain the expected Auth0 subject claim.');
        setApiState({ status: 'ready', identity });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setApiState({ status: 'error', message: cause instanceof Error ? cause.message : 'Unable to initialize your JengaFlow session.' });
      }
    }

    void loadIdentity();
    return () => controller.abort();
  }, [getAccessTokenSilently, isAuthenticated, isLoading]);

  if (isLoading) return <LoadingScreen message="Verifying your JengaFlow session…" />;
  if (!isAuthenticated) return <LoadingScreen message="Redirecting to secure sign-in…" />;

  return <Box sx={{ minHeight: '100vh', bgcolor: '#F7F5EF', color: '#17372B' }}>
    <Box sx={{ bgcolor: '#17372B', color: 'white', py: 2 }}>
      <Container maxWidth="lg">
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Avatar sx={{ bgcolor: '#D6A84F', color: '#17372B' }}><ConstructionRounded /></Avatar>
            <Box>
              <Typography fontWeight={900}>JengaFlow</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.65)' }}>QWERTY SYSTEMS WORKSPACE</Typography>
            </Box>
          </Stack>
          <Button color="inherit" startIcon={<LogoutRounded />} onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}>Sign out</Button>
        </Stack>
      </Container>
    </Box>
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
      <Typography variant="overline" sx={{ color: '#2F6B4F', fontWeight: 800, letterSpacing: '.14em' }}>AUTHENTICATED WORKSPACE</Typography>
      <Typography variant="h3" fontWeight={900} sx={{ mt: 1, fontSize: { xs: '2rem', md: '2.7rem' } }}>
        Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>
        Your identity has been verified. JengaFlow is checking the application API before opening your workspace.
      </Typography>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderColor: '#E3E0D6', borderRadius: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar src={user?.picture} alt={user?.name ?? 'User'} sx={{ width: 56, height: 56 }}>{user?.name?.charAt(0) ?? user?.email?.charAt(0) ?? 'U'}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={800}>{user?.name ?? 'Authenticated user'}</Typography>
            <Typography color="text.secondary" variant="body2">{user?.email ?? 'Email not provided by identity provider'}</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <VerifiedUserRounded color="success" />
        </Stack>
        <Divider sx={{ my: 2.5 }} />
        <Stack direction="row" alignItems="center" spacing={1}>
          <ApiRounded color="primary" />
          <Typography fontWeight={800}>JengaFlow API connection</Typography>
        </Stack>
        {apiState.status === 'loading' && <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
          <CircularProgress size={20} /><Typography color="text.secondary" variant="body2">Loading authenticated profile…</Typography>
        </Stack>}
        {apiState.status === 'ready' && <Alert severity="success" sx={{ mt: 2 }}>
          API authentication succeeded. Identity subject: <strong>{apiState.identity.auth0Subject}</strong>
        </Alert>}
        {apiState.status === 'error' && <Alert severity="error" sx={{ mt: 2 }}>{apiState.message}</Alert>}
        {authError && <Alert severity="error" sx={{ mt: 2 }}>{authError.message}</Alert>}
      </Paper>
      <Alert severity="info" sx={{ mt: 3, alignItems: 'flex-start' }}>
        <Typography fontWeight={800} component="div">Workspace setup is not yet available</Typography>
        <Typography variant="body2">
          The current repository contains the identity and database foundations, but company onboarding,
          membership provisioning, role management and operational payroll screens have not yet been implemented.
          No payroll or company data will be fabricated or displayed as if it were live.
        </Typography>
      </Alert>
      <Button sx={{ mt: 3 }} variant="outlined" onClick={() => navigateTo('/')}>Back to public site</Button>
    </Container>
  </Box>;
}
