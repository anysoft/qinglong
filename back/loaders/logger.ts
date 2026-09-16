import winston from 'winston';
import 'winston-daily-rotate-file';
import config from '../config';
import path from 'path';

const levelMap: Record<string, string> = {
  info: 'ℹ️', // info图标
  warn: '⚠️', // 警告图标
  error: '❌', // 错误图标
  debug: '🐛', // debug调试图标
};

const baseFormat = [
  winston.format.splat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.align(),
];

const consoleFormat = winston.format.combine(
  winston.format.colorize({ level: true }),
  ...baseFormat,
  winston.format.printf((info) => {
    return `[${info.level} ${info.timestamp}]:${info.message}`;
  }),
);

const plainFormat = winston.format.combine(
  winston.format.uncolorize(),
  ...baseFormat,
  winston.format.printf((info) => {
    return `[${levelMap[info.level] || ''}${info.level} ${info.timestamp}]:${
      info.message
    }`;
  }),
);

const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
  level: 'debug',
});


const LoggerInstance = winston.createLogger({
  level: 'debug',
  levels: winston.config.npm.levels,
  transports: [consoleTransport],
  exceptionHandlers: [consoleTransport],
  rejectionHandlers: [consoleTransport],
});

LoggerInstance.on('error', (error) => {
  console.error('Logger error:', error);
});

let fileLoggingEnabled = false;
/** Called only after offline restore and private data directory bootstrap. */
export function enableFileLogging() {
  if (fileLoggingEnabled) return;
  const fileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(config.systemLogPath, '%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '7d',
  format: plainFormat,
  level: config.logs.level || 'info',
});

  LoggerInstance.add(fileTransport);
  LoggerInstance.exceptions.handle(fileTransport);
  LoggerInstance.rejections.handle(fileTransport);
  fileLoggingEnabled = true;
}

export default LoggerInstance;
