import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { getDatabaseOptions } from './database/database-options';

@Module({
  imports: [TypeOrmModule.forRoot(getDatabaseOptions())],
  controllers: [AppController],
})
export class AppModule {}
