import { useEffect, useRef, useState } from 'react';
import { Alert, Button, CircularProgress, Stack } from '@mui/material';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
          renderButton(element: HTMLElement, options: Record<string, string | number>): void;
        };
      };
    };
  }
}

type Props = {
  onSignedIn: (session: { accessToken: string; expiresIn: number; user: { id: string; email: string; name: string | null; avatarUrl: string | null } }) => void;
};

export default function GoogleSignInButton({ onSignedIn }: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setBusy(true);
          setError('');
          try {
            const response = await fetch(`${apiBase}/api/v1/auth/google`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential }),
            });
            if (!response.ok) throw new Error('Google sign-in could not be completed.');
            onSignedIn(await response.json());
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
          } finally {
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: 'outline', size: 'large', shape: 'rectangular', width: 280 });
    };
    if (window.google) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = render;
      script.onerror = () => setError('Google sign-in could not be loaded.');
      document.head.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [apiBase, clientId, onSignedIn]);

  if (!clientId) return <Alert severity="warning">Google sign-in is not configured for this deployment.</Alert>;
  return <Stack spacing={1} alignItems="flex-start">
    <div ref={buttonRef} />
    {busy && <CircularProgress size={22} />}
    {error && <Alert severity="error">{error}</Alert>}
    <Button size="small" onClick={() => {
      void fetch(`${apiBase}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
        .then(async r => { if (!r.ok) throw new Error(); onSignedIn(await r.json()); })
        .catch(() => setError('Your session has expired. Please sign in again.'));
    }}>Restore session</Button>
  </Stack>;
}
