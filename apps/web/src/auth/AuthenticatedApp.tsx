import { FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Alert, Avatar, Box, Button, CircularProgress, Container, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import VerifiedUserRounded from '@mui/icons-material/VerifiedUserRounded';
import ApiRounded from '@mui/icons-material/ApiRounded';
import { auth0Config } from '../config';
import { slugifyWorkspaceName } from './workspace-slug';
import TenantWorkspace from '../workspace/TenantWorkspace';

type Membership = { tenantId: string; slug: string; displayName: string; legalName: string; tenantStatus: string; membershipId: string; role: string };
type ApiIdentity = { auth0Subject?: string; email?: string | null; emailVerified?: boolean; name?: string | null; picture?: string | null; provisioned?: boolean; memberships?: Membership[]; identity?: { email?: string; name?: string } };
type ApiState = { status: 'loading' } | { status: 'ready'; identity: ApiIdentity } | { status: 'error'; message: string };

function LoadingScreen({ message }: { message: string }) {
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#F7F5EF', p: 3 }}><Stack alignItems="center" spacing={2}><CircularProgress /><Typography color="text.secondary">{message}</Typography></Stack></Box>;
}

export default function AuthenticatedApp() {
  const { isLoading, isAuthenticated, user, error: authError, getAccessTokenSilently, loginWithRedirect, logout } = useAuth0();
  const redirectStarted = useRef(false);
  const [apiState, setApiState] = useState<ApiState>({ status: 'loading' });
  const [company, setCompany] = useState({ legalName: '', displayName: '', slug: '', timezone: 'Africa/Nairobi', currency: 'KES' });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [onboardError, setOnboardError] = useState('');

  useEffect(() => {
    if (isLoading || isAuthenticated || redirectStarted.current) return;
    redirectStarted.current = true;
    void loginWithRedirect({ appState: { returnTo: '/app' }, authorizationParams: { connection: 'google-oauth2' } }).catch(() => { redirectStarted.current = false; });
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const controller = new AbortController();
    async function loadIdentity() {
      try {
        if (!auth0Config.apiBaseUrl) throw new Error('The API base URL is not configured for this deployment.');
        const token = await getAccessTokenSilently({ authorizationParams: { audience: auth0Config.audience, scope: 'openid profile email' } });
        const response = await fetch(`${auth0Config.apiBaseUrl.replace(/\/+$/, '')}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? 'The API rejected the access token. Verify its issuer and audience.' : `The JengaFlow API returned HTTP ${response.status}.`);
        setApiState({ status: 'ready', identity: await response.json() as ApiIdentity });
      } catch (cause) {
        if (!controller.signal.aborted) setApiState({ status: 'error', message: cause instanceof Error ? cause.message : 'Unable to initialize your JengaFlow session.' });
      }
    }
    void loadIdentity();
    return () => controller.abort();
  }, [getAccessTokenSilently, isAuthenticated, isLoading]);

  function updateDisplayName(displayName: string) {
    setCompany(current => ({
      ...current,
      displayName,
      ...(!slugManuallyEdited ? { slug: slugifyWorkspaceName(displayName) } : {}),
    }));
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setOnboardError('');
    try {
      const token = await getAccessTokenSilently({ authorizationParams: { audience: auth0Config.audience, scope: 'openid profile email' } });
      const response = await fetch(`${auth0Config.apiBaseUrl.replace(/\/+$/, '')}/api/v1/auth/onboarding/company`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(company),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : `Company setup failed (HTTP ${response.status}).`);
      window.location.reload();
    } catch (cause) {
      setOnboardError(cause instanceof Error ? cause.message : 'Unable to create your company workspace.');
      setSubmitting(false);
    }
  }

  if (isLoading) return <LoadingScreen message="Verifying your JengaFlow session…" />;
  if (!isAuthenticated) return <LoadingScreen message="Redirecting to secure sign-in…" />;

  const identity = apiState.status === 'ready' ? apiState.identity : undefined;
  return <Box sx={{ minHeight: '100vh', bgcolor: '#F7F5EF', color: '#17372B' }}>
    <Box sx={{ bgcolor: '#17372B', color: 'white', py: 2 }}><Container maxWidth="lg"><Stack direction="row" alignItems="center" justifyContent="space-between"><Stack direction="row" alignItems="center" spacing={1.5}><Avatar sx={{ bgcolor: '#D6A84F', color: '#17372B' }}><ConstructionRounded /></Avatar><Box><Typography fontWeight={900}>JengaFlow</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.65)' }}>QWERTY SYSTEMS WORKSPACE</Typography></Box></Stack><Button color="inherit" startIcon={<LogoutRounded />} onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}>Sign out</Button></Stack></Container></Box>
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 7 } }}>
      <Typography variant="overline" sx={{ color: '#2F6B4F', fontWeight: 800, letterSpacing: '.14em' }}>AUTHENTICATED WORKSPACE</Typography>
      <Typography variant="h3" fontWeight={900} sx={{ mt: 1, fontSize: { xs: '2rem', md: '2.7rem' } }}>Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>Your identity has been verified. Set up or select your company workspace to continue.</Typography>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderColor: '#E3E0D6', borderRadius: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center"><Avatar src={user?.picture} alt={user?.name ?? 'User'} sx={{ width: 56, height: 56 }}>{user?.name?.charAt(0) ?? 'U'}</Avatar><Box><Typography fontWeight={800}>{user?.name ?? 'Authenticated user'}</Typography><Typography color="text.secondary" variant="body2">{user?.email ?? 'Email not provided'}</Typography></Box><Box sx={{ flex: 1 }} /><VerifiedUserRounded color="success" /></Stack>
        <Divider sx={{ my: 2.5 }} /><Stack direction="row" alignItems="center" spacing={1}><ApiRounded color="primary" /><Typography fontWeight={800}>JengaFlow API connection</Typography></Stack>
        {apiState.status === 'loading' && <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }}><CircularProgress size={20} /><Typography color="text.secondary" variant="body2">Loading authenticated profile…</Typography></Stack>}
        {apiState.status === 'error' && <Alert severity="error" sx={{ mt: 2 }}>{apiState.message}</Alert>}
        {apiState.status === 'ready' && <Alert severity="success" sx={{ mt: 2 }}>API authentication succeeded. {identity?.provisioned ? 'Your JengaFlow account is provisioned.' : 'Your identity is ready for company setup.'}</Alert>}
        {authError && <Alert severity="error" sx={{ mt: 2 }}>{authError.message}</Alert>}
      </Paper>
      {identity && !identity.provisioned && <Paper component="form" onSubmit={createCompany} variant="outlined" sx={{ mt: 3, p: { xs: 2.5, md: 3 }, borderRadius: 3, borderColor: '#E3E0D6' }}>
        <Typography variant="h5" fontWeight={900}>Create your company workspace</Typography>
        <Typography color="text.secondary" sx={{ mt: .5, mb: 2.5 }}>Your account will become the initial company owner. A trial workspace and default Kenya payroll settings will be created.</Typography>
        <Stack spacing={2}>
          <TextField required label="Legal company name" value={company.legalName} onChange={e => setCompany(v => ({ ...v, legalName: e.target.value }))} fullWidth />
          <TextField required label="Display name" value={company.displayName} onChange={e => updateDisplayName(e.target.value)} fullWidth />
          <TextField required label="Workspace URL slug" helperText="Generated from the display name. You can edit it; lowercase letters, numbers and hyphens only." value={company.slug} onChange={e => { setSlugManuallyEdited(true); setCompany(v => ({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })); }} fullWidth />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label="Timezone" value={company.timezone} onChange={e => setCompany(v => ({ ...v, timezone: e.target.value }))} fullWidth /><TextField label="Currency" value={company.currency} inputProps={{ maxLength: 3 }} onChange={e => setCompany(v => ({ ...v, currency: e.target.value.toUpperCase() }))} fullWidth /></Stack>
          {onboardError && <Alert severity="error">{onboardError}</Alert>}
          <Button type="submit" variant="contained" disabled={submitting || !company.legalName.trim() || !company.displayName.trim() || company.slug.length < 3} sx={{ py: 1.4, bgcolor: '#17372B', '&:hover': { bgcolor: '#2F6B4F' } }}>{submitting ? 'Creating workspace…' : 'Create company workspace'}</Button>
        </Stack>
      </Paper>}
      {identity?.provisioned && <TenantWorkspace
        memberships={identity.memberships ?? []}
        userName={user?.name}
        userPicture={user?.picture}
        apiBaseUrl={auth0Config.apiBaseUrl}
        getToken={() => getAccessTokenSilently({ authorizationParams: { audience: auth0Config.audience, scope: 'openid profile email' } })}
        onSignOut={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
      />}
    </Container>
  </Box>;
}
