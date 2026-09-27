import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AccessJwtGuard } from '../auth/access-jwt.guard';
import { AuthenticatedUser } from '../auth/access-jwt.strategy';
import { SessionResponseDto } from './dto/session-response.dto';
import { SessionsService } from './sessions.service';

@ApiTags('Sessions')
@ApiBearerAuth('access-token')
@UseGuards(AccessJwtGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions for the authenticated user' })
  @ApiOkResponse({ type: SessionResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  list(
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<SessionResponseDto[]> {
    return this.sessionsService.listActive(
      request.user.userId,
      request.user.sessionId,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke one owned session' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Session revoked or already revoked' })
  @ApiBadRequestResponse({ description: 'Invalid session ID' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiNotFoundResponse({ description: 'Session not found' })
  revoke(
    @Req() request: Request & { user: AuthenticatedUser },
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<void> {
    return this.sessionsService.revokeById(request.user.userId, sessionId);
  }
}
