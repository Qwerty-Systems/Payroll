import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Vitest runs without global hooks in this workspace. Explicit cleanup prevents
// DOM from earlier tests leaking into later tests and creating false failures.
afterEach(() => cleanup());
