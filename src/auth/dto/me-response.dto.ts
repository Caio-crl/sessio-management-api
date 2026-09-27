import { ApiProperty } from '@nestjs/swagger';

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid' })
  sessionId: string;
}
