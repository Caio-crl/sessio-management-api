import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { getDatabaseOptions } from './database/database-options';

@Module({
  imports: [TypeOrmModule.forRoot(getDatabaseOptions()), AuthModule],
  controllers: [AppController],
})
export class AppModule {}
