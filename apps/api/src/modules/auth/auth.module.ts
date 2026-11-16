import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityService } from './identity.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, IdentityService],
  exports: [AuthService, IdentityService],
})
export class AuthModule {}
