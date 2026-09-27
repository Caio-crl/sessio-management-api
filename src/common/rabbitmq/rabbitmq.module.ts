import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { RabbitMqService } from './rabbitmq.service';
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      useFactory: async function () {
        const uri = process.env.RABBITMQ_URI;
        if (!uri) {
          throw new Error('RABBITMQ_URI is required');
        }
        return {
          uri,
          exchanges: [
            {
              name: 'worker-nestjs-teste',
              type: 'direct',
              durable: true, // A exchange persiste após restart
              autoDelete: false, // Não apaga automaticamente
              prefetchCount: 1,
              options: {
                durable: true, // A fila persiste após restart
                autoDelete: false, // Não apaga automaticamente
              },
            },
          ],
          queues: [{ name: 'nome_da_fila' }],
          connectionInitOptions: { wait: true },
        };
      },
    }),
  ],
  providers: [RabbitMqService],
  exports: [RabbitMqService],
})
export class RabbitMqModule {}
