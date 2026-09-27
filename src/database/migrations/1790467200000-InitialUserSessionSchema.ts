import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class InitialUserSessionSchema1790467200000 implements MigrationInterface {
  name = 'InitialUserSessionSchema1790467200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'email', type: 'varchar', length: '254' },
          { name: 'password_hash', type: 'varchar', length: '255' },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
          },
        ],
        indices: [
          new TableIndex({
            name: 'UQ_users_email',
            columnNames: ['email'],
            isUnique: true,
          }),
        ],
      }),
      false,
    );

    await queryRunner.createTable(
      new Table({
        name: 'sessions',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'user_id', type: 'varchar', length: '36' },
          { name: 'refresh_token_hash', type: 'char', length: '64' },
          {
            name: 'previous_refresh_token_hash',
            type: 'char',
            length: '64',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          { name: 'last_used_at', type: 'datetime', precision: 6 },
          { name: 'expires_at', type: 'datetime', precision: 6 },
          {
            name: 'revoked_at',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_sessions_user_id',
            columnNames: ['user_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_sessions_user_id',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
      }),
      false,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sessions');
    await queryRunner.dropTable('users');
  }
}
