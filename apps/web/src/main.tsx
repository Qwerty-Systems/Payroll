import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';
import { auth0Config } from './config';
import { navigateTo } from './navigation';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2F6B4F', dark: '#17372B', light: '#E7F0E9', contrastText: '#FFFFFF' },
    secondary: { main: '#B77932', dark: '#855322', light: '#F5E9D6', contrastText: '#FFFFFF' },
    background: { default: '#F7F5EF', paper: '#FFFFFF' },
    text: { primary: '#24332B', secondary: '#68756D' },
    divider: '#E8E4D9',
    success: { main: '#2F7655' },
    warning: { main: '#B77932' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: { textTransform: 'none', fontWeight: 700 },
  },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 10, boxShadow: 'none' }, containedPrimary: { '&:hover': { boxShadow: '0 6px 18px rgba(23,55,43,.16)' } } } },
    MuiPaper: { styleOverrides: { rounded: { borderRadius: 16 } } },
    MuiCard: { styleOverrides: { root: { borderRadius: 16 } } },
  },
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}

const { domain: auth0Domain, clientId: auth0ClientId, audience: auth0Audience, redirectUri: auth0RedirectUri } = auth0Config;

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
    onRedirectCallback={(appState) => {
      const returnTo = typeof appState?.returnTo === 'string' && appState.returnTo.startsWith('/')
        ? appState.returnTo
        : '/app';

      // Keep the callback transition inside the SPA. A document reload clears
      // Auth0's in-memory cache before the authenticated route can use it.
      navigateTo(returnTo, true);
    }}
  >{app}</Auth0Provider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
