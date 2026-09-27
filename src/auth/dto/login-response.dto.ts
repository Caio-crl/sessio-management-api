import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({ description: 'Opaque refresh token for the new session' })
  refreshToken: string;
}
