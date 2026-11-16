import { useCallback, useState } from 'react';
import { Alert, Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import GoogleSignInButton from './GoogleSignInButton';

type Session = { accessToken: string; expiresIn: number; user: { id: string; email: string; name: string | null; avatarUrl: string | null } };

export default function SignInPage() {
  const [session, setSession] = useState<Session | null>(null);
  const onSignedIn = useCallback((value: Session) => setSession(value), []);
  return <Box sx={{ minHeight: '100vh', bgcolor: '#0a192f', display: 'grid', placeItems: 'center', p: 2 }}>
    <Container maxWidth="xs">
      <Paper elevation={12} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 4 }}>
        <Button href="/" startIcon={<ArrowBackRounded />} sx={{ mb: 2 }}>Back to JengaFlow</Button>
        <Typography variant="h4" fontWeight={900} color="#0a192f">Welcome back</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Sign in securely to your JengaFlow account.</Typography>
        {session ? <Stack spacing={2}>
          <Alert severity="success">Google identity verified and session created for {session.user.email}.</Alert>
          <Typography variant="body2" color="text.secondary">Your access token is held in this page's memory only. The authenticated workspace screens and tenant membership onboarding are still being completed.</Typography>
          <Button variant="outlined" onClick={() => { void fetch((import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => setSession(null)); }}>Sign out</Button>
        </Stack> : <GoogleSignInButton onSignedIn={onSignedIn} />}
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 4 }}>JengaFlow by Qwerty Systems</Typography>
      </Paper>
    </Container>
  </Box>;
}
