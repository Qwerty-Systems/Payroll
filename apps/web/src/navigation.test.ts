import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateTo } from './navigation';

describe('navigateTo', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('pushes an in-app route and notifies route listeners', () => {
    const listener = vi.fn();
    window.addEventListener('popstate', listener);

    navigateTo('/app');

    expect(window.location.pathname).toBe('/app');
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', listener);
  });

  it('replaces the current route when requested', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    navigateTo('/auth/callback', true);

    expect(replaceSpy).toHaveBeenCalledWith({}, document.title, '/auth/callback');
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('does not reload the document while navigating', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    navigateTo('/app', true);
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(PopStateEvent));
  });
});
