import { useAuth0 } from '@auth0/auth0-react';
import { Alert, Box, Button, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import GoogleIcon from '@mui/icons-material/Google';

const auth0Configured = Boolean(
  import.meta.env.VITE_AUTH0_DOMAIN &&
  import.meta.env.VITE_AUTH0_CLIENT_ID &&
  import.meta.env.VITE_AUTH0_AUDIENCE,
);

export default function SignInPage() {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, logout } = useAuth0();

  const signInWithGoogle = () => loginWithRedirect({
    authorizationParams: { connection: 'google-oauth2' },
  });

  return <Box sx={{ minHeight: '100vh', bgcolor: '#0a192f', display: 'grid', placeItems: 'center', p: 2 }}>
    <Container maxWidth="xs">
      <Paper elevation={12} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 4 }}>
        <Button href="/" startIcon={<ArrowBackRounded />} sx={{ mb: 2 }}>Back to JengaFlow</Button>
        <Typography variant="h4" fontWeight={900} color="#0a192f">Welcome back</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Sign in securely to your JengaFlow account.</Typography>

        {!auth0Configured && <Alert severity="warning">Auth0 is not configured for this deployment. Set the VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID and VITE_AUTH0_AUDIENCE build variables.</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error.message}</Alert>}

        {isLoading ? <Stack alignItems="center" spacing={1}><CircularProgress /><Typography color="text.secondary">Checking your session…</Typography></Stack>
          : isAuthenticated ? <Stack spacing={2}>
            <Alert severity="success">Signed in as {user?.email ?? user?.name ?? user?.sub}.</Alert>
            <Typography variant="body2" color="text.secondary">Your identity is verified by Auth0. Company membership and application permissions are enforced separately by JengaFlow.</Typography>
            <Button variant="contained" onClick={() => window.location.assign('/')}>Continue to JengaFlow</Button>
            <Button variant="outlined" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>Sign out</Button>
          </Stack>
          : <Button fullWidth size="large" variant="contained" disabled={!auth0Configured}
              onClick={() => void signInWithGoogle()} startIcon={<GoogleIcon />}
              sx={{ py: 1.4, bgcolor: '#1d513b', fontWeight: 800, '&:hover': { bgcolor: '#14251d' } }}>
              Continue with Google
            </Button>}

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 4 }}>JengaFlow by Qwerty Systems · Secure sign-in powered by Auth0</Typography>
      </Paper>
    </Container>
  </Box>;
}
