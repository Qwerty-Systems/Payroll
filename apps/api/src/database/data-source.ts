import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be configured before running migrations.');
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  migrationsRun: false,
  logging: process.env.NODE_ENV === 'development',
});
export default AppDataSource;
