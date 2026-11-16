import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
      migrationsRun: false,
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      retryAttempts: 5,
      retryDelay: 3000,
      logging: process.env.NODE_ENV === 'development',
    }),
  ],
})
export class DatabaseModule {}
