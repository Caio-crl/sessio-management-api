import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { argon2id, hash, HashOptions } from 'argon2';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RegisterResponseDto } from './dto/register-response.dto';
import { RegisterDto } from './dto/register.dto';

const PASSWORD_HASH_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
};

function isDuplicateEntry(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError: unknown = error.driverError;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === 'ER_DUP_ENTRY'
  );
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async register(input: RegisterDto): Promise<RegisterResponseDto> {
    const email = input.email.trim().toLowerCase();
    let passwordHash: string;

    try {
      passwordHash = await hash(input.password, PASSWORD_HASH_OPTIONS);
    } catch {
      throw new InternalServerErrorException('Could not complete registration');
    }

    try {
      const user = await this.users.save({ email, passwordHash });
      return { id: user.id, email: user.email, createdAt: user.createdAt };
    } catch (error: unknown) {
      if (isDuplicateEntry(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw new InternalServerErrorException('Could not complete registration');
    }
  }
}
