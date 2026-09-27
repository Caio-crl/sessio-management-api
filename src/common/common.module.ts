import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';

import { RabbitMqModule } from './rabbitmq/rabbitmq.module';

@Global()
@Module({
s  providers: [AppService],
  exports: [AppService,DatabaseModule,RabbitMqModule],
})
export class CommonModule {}
