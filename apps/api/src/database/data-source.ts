import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getPostgresConfig } from './postgres.config';

export const AppDataSource = new DataSource({
  ...getPostgresConfig({ migrations: true }),
  entities: [],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,

  migrationsRun: false,
  logging: process.env.NODE_ENV === 'development',
});
