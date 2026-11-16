/**
 * Demo seeding is intentionally disabled until the tenant/auth schema is migrated.
 * A future implementation must refuse to run when NODE_ENV=production and must
 * create deterministic demo tenants/users with development-only credentials.
 */
if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo seeding is disabled in production.');
}
throw new Error('Demo seed is not available until Stage 3 identity and tenant migrations are implemented.');
