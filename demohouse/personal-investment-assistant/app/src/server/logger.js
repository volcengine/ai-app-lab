const secretPatterns = [
  /ark-[A-Za-z0-9-]{12,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /(?:api[_-]?key|token|secret)["'=:\s]+[A-Za-z0-9._-]{8,}/gi,
];

export function redact(value) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return secretPatterns.reduce((current, pattern) => current.replace(pattern, '[REDACTED]'), text);
}

function write(level, event, fields = {}) {
  const payload = {
    time: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  process.stdout.write(`${redact(payload)}\n`);
}

export const logger = {
  info(event, fields) { write('info', event, fields); },
  warn(event, fields) { write('warn', event, fields); },
  error(event, fields) { write('error', event, fields); },
};
