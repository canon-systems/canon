type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFields = Record<string, unknown>;
type LoggerOptions = {
  label?: string;
  eventLabels?: Record<string, string>;
  uppercaseEventLabels?: boolean;
};

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const MAX_FIELD_LENGTH = 280;
const UPPERCASE_TOKENS = new Set(['aku', 'api', 'id', 'llm', 'sid', 'ui', 'url', 'utc', 'db']);
const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  bold: '\x1b[1m',
};

type LoggerRuntimeOptions = {
  label?: string;
  eventLabels: Record<string, string>;
  uppercaseEventLabels: boolean;
};

function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized;
  }
  return DEFAULT_LOG_LEVEL;
}

function parseComponentFilter(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function shouldLog(level: LogLevel, component: string): boolean {
  const activeLevel = parseLogLevel(process.env.CANON_LOG_LEVEL);
  if (LOG_LEVELS[level] < LOG_LEVELS[activeLevel]) return false;

  const allowedComponents = parseComponentFilter(process.env.CANON_LOG_COMPONENTS);
  if (allowedComponents.length === 0) return true;

  const normalizedComponent = component.toLowerCase();
  return allowedComponents.some((candidate) => normalizedComponent === candidate || normalizedComponent.startsWith(`${candidate}.`));
}

function safeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, entry) => {
      if (entry instanceof Error) {
        return {
          name: entry.name,
          message: entry.message,
        };
      }
      if (entry && typeof entry === 'object') {
        if (seen.has(entry)) return '[Circular]';
        seen.add(entry);
      }
      return entry;
    }) ?? 'null';
  } catch {
    return '"[Unserializable]"';
  }
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function humanizeToken(token: string): string {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return '';
  if (UPPERCASE_TOKENS.has(normalized)) return normalized.toUpperCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function humanizeLabel(value: string): string {
  return value
    .split(/[._\-\s]+/)
    .map((token) => humanizeToken(token))
    .filter((token) => token.length > 0)
    .join(' ')
    .trim();
}

function parseColorMode(value: string | undefined): 'auto' | 'on' | 'off' {
  const normalized = (value || '').trim().toLowerCase();
  if (['1', 'true', 'on', 'yes', 'always'].includes(normalized)) return 'on';
  if (['0', 'false', 'off', 'no', 'never'].includes(normalized)) return 'off';
  return 'auto';
}

function colorsEnabled(): boolean {
  if (typeof process !== 'undefined' && typeof process.env.NO_COLOR === 'string') return false;
  const mode = parseColorMode(process.env.CANON_LOG_COLOR);
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return Boolean(typeof process !== 'undefined' && process.stdout?.isTTY);
}

function colorize(value: string, color: string, enabled: boolean): string {
  if (!enabled) return value;
  return `${color}${value}${ANSI.reset}`;
}

function levelColor(level: LogLevel): string {
  if (level === 'error') return ANSI.red;
  if (level === 'warn') return ANSI.yellow;
  if (level === 'debug') return ANSI.gray;
  return ANSI.green;
}

function formatEventLabel(event: string, options: LoggerRuntimeOptions): string {
  const custom = options.eventLabels[event];
  const base = custom
    ? compactWhitespace(custom)
    : humanizeLabel(event);
  if (!base) return event;
  return options.uppercaseEventLabels ? base.toUpperCase() : base;
}

function formatFieldValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (value instanceof Error) {
    return safeJson({ name: value.name, message: value.message });
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'string') {
    const compacted = compactWhitespace(value);
    const safe = /[\s="'`]/.test(compacted) ? JSON.stringify(compacted) : compacted;
    return safe.length <= MAX_FIELD_LENGTH ? safe : `${safe.slice(0, MAX_FIELD_LENGTH - 3)}...`;
  }

  const serialized = safeJson(value);
  const compacted = compactWhitespace(serialized);
  return compacted.length <= MAX_FIELD_LENGTH ? compacted : `${compacted.slice(0, MAX_FIELD_LENGTH - 3)}...`;
}

function formatFields(fields?: LogFields): string {
  if (!fields) return '';
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return '';
  return entries
    .map(([key, value]) => `${key}=${formatFieldValue(value)}`)
    .join(' ');
}

function emit(level: LogLevel, component: string, event: string, fields: LogFields | undefined, options: LoggerRuntimeOptions): void {
  if (!shouldLog(level, component)) return;

  const enabledColors = colorsEnabled();
  const componentLabel = humanizeLabel(options.label || component) || component;
  const eventLabel = formatEventLabel(event, options);
  const componentToken = colorize(`[${componentLabel}]`, ANSI.cyan, enabledColors);
  const eventToken = colorize(`[${eventLabel}]`, ANSI.magenta, enabledColors);
  const tsToken = colorize(new Date().toISOString(), ANSI.dim, enabledColors);
  const levelToken = colorize(level.toUpperCase(), `${ANSI.bold}${levelColor(level)}`, enabledColors);
  const prefix = `${componentToken} ${eventToken} ${tsToken} ${levelToken}`;
  const payload = formatFields(fields);
  const line = payload ? `${prefix} ${payload}` : prefix;

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function createLogger(component: string, options: LoggerOptions = {}) {
  const runtime: LoggerRuntimeOptions = {
    label: options.label,
    eventLabels: options.eventLabels ?? {},
    uppercaseEventLabels: options.uppercaseEventLabels !== false,
  };
  return {
    debug: (event: string, fields?: LogFields) => emit('debug', component, event, fields, runtime),
    info: (event: string, fields?: LogFields) => emit('info', component, event, fields, runtime),
    warn: (event: string, fields?: LogFields) => emit('warn', component, event, fields, runtime),
    error: (event: string, fields?: LogFields) => emit('error', component, event, fields, runtime),
  };
}
