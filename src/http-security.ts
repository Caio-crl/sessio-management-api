import { PayloadTooLargeException, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

export function configureHttpSecurity(app: NestExpressApplication): void {
  app.use(helmet());
  app.useBodyParser('json', { limit: '8kb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '8kb' });
  app.use(
    (
      error: unknown,
      _request: Request,
      _response: Response,
      next: NextFunction,
    ) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        error.type === 'entity.too.large'
      ) {
        next(new PayloadTooLargeException('Request body too large'));
        return;
      }
      next(error);
    },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
