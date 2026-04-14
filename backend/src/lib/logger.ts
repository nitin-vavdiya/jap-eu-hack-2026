import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

/**
 * Singleton pino logger.
 *
 * - Production: plain JSON output (structured, machine-readable)
 * - Development: pretty-printed output via pino-pretty transport
 *
 * Sensitive fields are automatically redacted from all log output.
 */
const logger = pino({
  level,
  redact: {
    paths: ['password', 'client_secret', 'credentials', '*.password', '*.client_secret', '*.credentials'],
    censor: '[REDACTED]',
  },
  ...(process.env.NODE_ENV === 'production'
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
});

export default logger;
