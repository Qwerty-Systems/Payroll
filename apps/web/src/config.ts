type RuntimeConfig = {
  auth0Domain?: string;
  auth0ClientId?: string;
  auth0Audience?: string;
  auth0RedirectUri?: string;
  apiBaseUrl?: string;
};

declare global {
  interface Window {
    __JENGAFLOW_CONFIG__?: RuntimeConfig;
  }
}

const runtime = window.__JENGAFLOW_CONFIG__ ?? {};

export const auth0Config = {
  domain: runtime.auth0Domain || import.meta.env.VITE_AUTH0_DOMAIN || '',
  clientId: runtime.auth0ClientId || import.meta.env.VITE_AUTH0_CLIENT_ID || '',
  audience: runtime.auth0Audience || import.meta.env.VITE_AUTH0_AUDIENCE || '',
  redirectUri: runtime.auth0RedirectUri || import.meta.env.VITE_AUTH0_REDIRECT_URI || window.location.origin + '/auth/callback',
  apiBaseUrl: runtime.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || '',
};

export const auth0Configured = Boolean(auth0Config.domain && auth0Config.clientId && auth0Config.audience);
