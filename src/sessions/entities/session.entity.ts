import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('sessions')
@Index('IDX_sessions_user_id', ['userId'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({
    name: 'refresh_token_hash',
    type: 'char',
    length: 64,
    select: false,
  })
  refreshTokenHash: string;

  @Column({
    name: 'previous_refresh_token_hash',
    type: 'char',
    length: 64,
    nullable: true,
    select: false,
  })
  previousRefreshTokenHash: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @Column({ name: 'last_used_at', type: 'datetime', precision: 6 })
  lastUsedAt: Date;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({
    name: 'revoked_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  revokedAt: Date | null;

  @ManyToOne(() => User, (user) => user.sessions, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'FK_sessions_user_id',
  })
  user: User;
}
