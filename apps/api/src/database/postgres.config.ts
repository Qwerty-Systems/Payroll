type PostgresConfigOptions = { migrations?: boolean };

export function getPostgresConfig(options: PostgresConfigOptions = {}) {
  const migration = options.migrations === true;
  const url = migration
    ? process.env.MIGRATIONS_DATABASE_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL;
  const host = migration
    ? process.env.MIGRATIONS_DATABASE_HOST || process.env.DATABASE_HOST
    : process.env.DATABASE_HOST;
  const username = migration
    ? process.env.MIGRATIONS_DATABASE_USERNAME || process.env.DATABASE_USERNAME
    : process.env.DATABASE_USERNAME;
  const password = migration
    ? process.env.MIGRATIONS_DATABASE_PASSWORD || process.env.DATABASE_PASSWORD
    : process.env.DATABASE_PASSWORD;
  const database = migration
    ? process.env.MIGRATIONS_DATABASE_NAME || process.env.DATABASE_NAME
    : process.env.DATABASE_NAME;
  const port = Number(migration
    ? process.env.MIGRATIONS_DATABASE_PORT || process.env.DATABASE_PORT || 5432
    : process.env.DATABASE_PORT || 5432);

  if (!url && (!host || !username || !database)) {
    throw new Error(
      migration
        ? 'Configure MIGRATIONS_DATABASE_URL or database host, username and name before running migrations.'
        : 'Configure DATABASE_URL or DATABASE_HOST, DATABASE_USERNAME and DATABASE_NAME before connecting to PostgreSQL.',
    );
  }

  return {
    type: 'postgres' as const,
    ...(url ? { url } : { host, port, username, password, database }),
    ssl: process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined,
    extra: {
      min: Number(process.env.DATABASE_POOL_MIN ?? 2),
      max: Number(process.env.DATABASE_POOL_MAX ?? 20),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 10000),
    },
  };
}
