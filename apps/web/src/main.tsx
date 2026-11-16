import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';

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
    h1: { color: '#17372B' },
    h2: { color: '#17372B' },
    h3: { color: '#17372B' },
    h4: { color: '#17372B' },
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
