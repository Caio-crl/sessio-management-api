import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { Session } from '../sessions/entities/session.entity';
import { User } from '../users/entities/user.entity';

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getDatabaseOptions(): DataSourceOptions {
  const portValue = requiredEnvironmentVariable('DB_PORT');
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535');
  }

  return {
    type: 'mysql',
    host: requiredEnvironmentVariable('DB_HOST'),
    port,
    username: requiredEnvironmentVariable('DB_USER'),
    password: requiredEnvironmentVariable('DB_PASSWORD'),
    database: requiredEnvironmentVariable('DB_NAME'),
    timezone: 'Z',
    entities: [User, Session],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    synchronize: false,
  };
}
