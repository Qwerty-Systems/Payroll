/**
 * Auth0 Post Login Action for JengaFlow.
 *
 * Adds the verified Auth0 profile fields needed by the API to its access token.
 * The API independently validates the JWT signature, issuer and audience before
 * consuming these namespaced claims.
 */
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://jengaflow.qwerty.co.ke';

  if (typeof event.user.email === 'string' && event.user.email.trim()) {
    api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email.trim().toLowerCase());
  }

  if (typeof event.user.email_verified === 'boolean') {
    api.accessToken.setCustomClaim(`${namespace}/email_verified`, event.user.email_verified);
  }

  const name = event.user.name || event.user.nickname;
  if (typeof name === 'string' && name.trim()) {
    api.accessToken.setCustomClaim(`${namespace}/name`, name.trim());
  }
};
