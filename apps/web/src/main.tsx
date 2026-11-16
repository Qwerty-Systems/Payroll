import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';

const theme = createTheme({ palette: { mode: 'light', primary: { main: '#1d513b', dark: '#14251d' }, secondary: { main: '#c28b43' }, background: { default: '#f4f6f3', paper: '#ffffff' } }, shape: { borderRadius: 10 }, typography: { fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' } });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined;
const auth0RedirectUri = (import.meta.env.VITE_AUTH0_REDIRECT_URI as string | undefined) ?? window.location.origin + '/auth/callback';

function Root() {
  const app = <ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>;
  return <Auth0Provider
    domain={auth0Domain || 'not-configured.invalid'}
    clientId={auth0ClientId || 'not-configured'}
    authorizationParams={{
      redirect_uri: auth0RedirectUri,
      audience: auth0Audience,
      scope: 'openid profile email offline_access',
    }}
    useRefreshTokens
    cacheLocation="memory"
  >{app}</Auth0Provider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
