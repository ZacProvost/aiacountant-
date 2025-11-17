type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMetadata {
  [key: string]: unknown;
}

const log = (level: LogLevel, message: string, metadata: LogMetadata = {}) => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
  const serialised = JSON.stringify(payload);
  switch (level) {
    case 'debug':
      console.debug(serialised);
      break;
    case 'info':
      console.info(serialised);
      break;
    case 'warn':
      console.warn(serialised);
      break;
    case 'error':
      console.error(serialised);
      break;
    default:
      console.log(serialised);
  }
};

export interface Logger {
  debug: (message: string, metadata?: LogMetadata) => void;
  info: (message: string, metadata?: LogMetadata) => void;
  warn: (message: string, metadata?: LogMetadata) => void;
  error: (message: string, metadata?: LogMetadata) => void;
  child: (metadata: LogMetadata) => Logger;
}

const mergeMetadata = (base: LogMetadata, next: LogMetadata): LogMetadata => ({
  ...base,
  ...next,
});

export const createLogger = (baseMetadata: LogMetadata = {}): Logger => {
  const metadata = { ...baseMetadata };
  const logger: Logger = {
    debug: (message, meta = {}) => log('debug', message, mergeMetadata(metadata, meta)),
    info: (message, meta = {}) => log('info', message, mergeMetadata(metadata, meta)),
    warn: (message, meta = {}) => log('warn', message, mergeMetadata(metadata, meta)),
    error: (message, meta = {}) => log('error', message, mergeMetadata(metadata, meta)),
    child: (meta) => createLogger(mergeMetadata(metadata, meta)),
  };
  return logger;
};





