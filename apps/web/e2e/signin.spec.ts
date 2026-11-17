import { expect, test } from '@playwright/test';

test('sign-in page loads and Google sign-in requests the configured Auth0 connection', async ({ page }) => {
  await page.goto('/signin');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  const button = page.getByRole('button', { name: /continue with google/i });
  await expect(button).toBeEnabled();

  let authorizeRequest: URL | undefined;
  await page.route('https://e2e-example.us.auth0.com/authorize**', async (route) => {
    authorizeRequest = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Auth0 E2E intercepted</title></head><body>Authorization request intercepted.</body></html>',
    });
  });

  await button.click();
  await expect.poll(() => authorizeRequest?.searchParams.get('connection')).toBe('google-oauth2');
  expect(authorizeRequest?.searchParams.get('client_id')).toBe('e2e-client-id');
  expect(authorizeRequest?.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4173/auth/callback');
});
