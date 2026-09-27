import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessJwtGuard } from '../auth/access-jwt.guard';
import { Session } from './entities/session.entity';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PassportModule, TypeOrmModule.forFeature([Session])],
  controllers: [SessionsController],
  providers: [SessionsService, AccessJwtGuard],
  exports: [SessionsService],
})
export class SessionsModule {}
