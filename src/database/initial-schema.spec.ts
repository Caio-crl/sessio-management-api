import { DataSource } from 'typeorm';
import { InitialUserSessionSchema1790467200000 } from './migrations/1790467200000-InitialUserSessionSchema';

describe('InitialUserSessionSchema migration', () => {
  it('generates the expected MySQL schema without connecting to a database', async () => {
    const dataSource = new DataSource({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'unused',
      password: 'unused',
      database: 'unused',
    });
    const queryRunner = dataSource.driver.createQueryRunner('master');
    queryRunner.enableSqlMemory();

    await new InitialUserSessionSchema1790467200000().up(queryRunner);

    const queries = queryRunner
      .getMemorySql()
      .upQueries.map(({ query }) => query);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('CREATE TABLE `users`');
    expect(queries[0]).toContain('PRIMARY KEY (`id`)');
    expect(queries[0]).toContain('UNIQUE INDEX `UQ_users_email` (`email`)');
    expect(queries[1]).toContain('CREATE TABLE `sessions`');
    expect(queries[1]).toContain('INDEX `IDX_sessions_user_id` (`user_id`)');
    expect(queries[1]).toContain(
      'CONSTRAINT `FK_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT',
    );
    expect(queries[1]).toContain('`previous_refresh_token_hash` char(64) NULL');
    expect(queries[1]).toContain('`revoked_at` datetime(6) NULL');
    expect(queries[1]).toContain('`expires_at` datetime(6) NOT NULL');
  });
});
