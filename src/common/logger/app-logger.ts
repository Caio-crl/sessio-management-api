
const DEFAULT_CONTEXT = 'nestjs-service';
const REDACT_KEYS = [
  'accessToken',
  'authorization',
  'authorizationHeader',
  'cookie',
  'credential',
  'credentials',
  'password',
  'refreshToken',
  'secret',
  'set-cookie',
  'token',
];
const MAX_ERROR_MESSAGE_LENGTH = 1_000;
const SENSITIVE_VALUE_REPLACEMENT = '[REDACTED]';

let configured = false;

export function configureAppLogger(
  options: Partial<LoggerOptions> = {},
): void {
  Logger.configure({
    contexto: options.contexto ?? DEFAULT_CONTEXT,
    level:
      options.level ?? getLogLevel(process.env.LOG_LEVEL, process.env.NODE_ENV),
    redactKeys: options.redactKeys ?? REDACT_KEYS,
    maxExtraSize: options.maxExtraSize ?? 128_000,
    adapter: options.adapter,
    idGenerator: options.idGenerator,
  });
  configured = true;
}

export const appLogger = {
  debug(message: string, extra?: Record<string, unknown>): void {
    ensureConfigured();
    Logger.debug(message, extra);
  },

  info(message: string, extra?: Record<string, unknown>): void {
    ensureConfigured();
    Logger.info(message, extra);
  },

  warn(message: string, extra?: Record<string, unknown>): void {
    ensureConfigured();
    Logger.warn(message, extra);
  },

  error(message: string, extra?: Record<string, unknown>): void {
    ensureConfigured();
    Logger.error(message, extra);
  },

  fatal(message: string, extra?: Record<string, unknown>): void {
    ensureConfigured();
    Logger.fatal(message, extra);
  },
};

export function getSafeErrorLogFields(
  error: unknown,
): Record<string, string | undefined> {
  return {
    errorName: getErrorName(error),
    errorCode: getErrorCode(error),
    errorMessage: getSafeErrorMessage(error),
  };
}

function ensureConfigured(): void {
  if (!configured) {
    configureAppLogger();
  }
}

function getLogLevel(
  value: string | undefined,
  nodeEnv: string | undefined,
): LogLevel {
  if (
    value === 'debug' ||
    value === 'info' ||
    value === 'warn' ||
    value === 'error' ||
    value === 'fatal'
  ) {
    return value;
  }

  if (nodeEnv === 'test') {
    return 'fatal';
  }

  return 'info';
}

function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  return typeof error;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code);
  }

  return undefined;
}

function getSafeErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error) || !error.message) {
    return undefined;
  }

  return sanitizeErrorMessage(error.message);
}

function sanitizeErrorMessage(message: string): string {
  return truncateMessage(
    message
      .replace(/[\r\n\t]+/g, ' ')
      .replace(
        /([\w.-]+):\/\/([^/\s:@]+):([^@\s/]+)@/g,
        `$1://${SENSITIVE_VALUE_REPLACEMENT}:${SENSITIVE_VALUE_REPLACEMENT}@`,
      )
      .replace(
        /(["']?(?:accessToken|authorization|authorizationHeader|cookie|credential|credentials|password|refreshToken|secret|set-cookie|token)["']?\s*[:=]\s*["']?)([^"',;\s}]+)/gi,
        `$1${SENSITIVE_VALUE_REPLACEMENT}`,
      )
      .trim(),
  );
}

function truncateMessage(message: string): string {
  if (message.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`;
}
