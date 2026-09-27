import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({ description: 'Short-lived access JWT' })
  accessToken: string;

  @ApiProperty({ description: 'Opaque refresh token for the new session' })
  refreshToken: string;
}
