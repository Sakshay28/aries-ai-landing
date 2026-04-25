// ═══════════════════════════════════════════════════════════
// 📋 STRUCTURED LOGGER
// ═══════════════════════════════════════════════════════════
// Provides a structured JSON logging format suitable for 
// ingestion by Datadog, Axiom, or CloudWatch.
// ═══════════════════════════════════════════════════════════

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata,
  };
  
  if (process.env.NODE_ENV === 'development') {
    // Human readable in dev
    const metaStr = metadata ? JSON.stringify(metadata) : '';
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
    console[level](`${prefix} [${level.toUpperCase()}] ${message} ${metaStr}`);
  } else {
    // JSON in production
    console[level](JSON.stringify(payload));
  }
}

export const logger = {
  info: (message: string, metadata?: Record<string, unknown>) => log('info', message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => log('warn', message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => log('error', message, metadata),
  debug: (message: string, metadata?: Record<string, unknown>) => log('debug', message, metadata),
};
