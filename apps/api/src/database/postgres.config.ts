export function getPostgresConfig() {
  const host = process.env.DATABASE_HOST;
  const url = process.env.DATABASE_URL;
  const port = Number(process.env.DATABASE_PORT ?? 5432);

  if (!url && (!host || !process.env.DATABASE_USERNAME || !process.env.DATABASE_NAME)) {
    throw new Error(
      'Configure DATABASE_URL or DATABASE_HOST, DATABASE_USERNAME and DATABASE_NAME before connecting to PostgreSQL.',
    );
  }

  return {
    type: 'postgres' as const,
    ...(url
      ? { url }
      : {
          host,
          port,
          username: process.env.DATABASE_USERNAME,
          password: process.env.DATABASE_PASSWORD,
          database: process.env.DATABASE_NAME,
        }),
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
