export const APP_ROUTE = '/app';

export function navigateTo(path: string, replace = false): void {
  if (replace) window.history.replaceState({}, document.title, path);
  else window.history.pushState({}, document.title, path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
