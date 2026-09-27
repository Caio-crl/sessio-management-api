import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { SessionResponseDto } from './dto/session-response.dto';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
  ) {}

  async listActive(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.sessions.find({
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      where: {
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      current: session.id === currentSessionId,
    }));
  }

  async revokeCurrent(userId: string, sessionId: string): Promise<void> {
    await this.markRevoked(userId, sessionId);
  }

  async revokeById(userId: string, sessionId: string): Promise<void> {
    const affected = await this.markRevoked(userId, sessionId);
    if (affected === 1) {
      return;
    }

    const owned = await this.sessions.existsBy({ id: sessionId, userId });
    if (!owned) {
      throw new NotFoundException('Session not found');
    }
  }

  private async markRevoked(
    userId: string,
    sessionId: string,
  ): Promise<number> {
    const result = await this.sessions.update(
      { id: sessionId, userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }
}
