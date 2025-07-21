export type LogLevel = 'info' | 'warning' | 'error' | 'trade' | 'learning';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  messageKey: string;
  params?: Record<string, any>;
  rawMessage?: string; // For non-localized messages
}

export interface LogFilter {
  level?: LogLevel;
  search?: string;
}

class LogService {
  private logs: LogEntry[] = [];
  private maxLogs: number = 100;
  private listeners: Array<(logs: LogEntry[]) => void> = [];

  constructor() {
    this.loadStoredLogs();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  log(level: LogLevel, messageKey: string, params?: Record<string, any>, rawMessage?: string) {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      level,
      messageKey,
      params,
      rawMessage
    };

    this.logs.unshift(entry); // Add to beginning for newest first

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Notify listeners
    this.notifyListeners();

    // Save to localStorage
    this.saveStoredLogs();

    // Also log to console for debugging (with prefix to identify source)
    const prefix = `[${level.toUpperCase()}]`;
    const message = rawMessage || messageKey;
    const paramsStr = params ? ` ${JSON.stringify(params)}` : '';
    
    switch (level) {
      case 'error':
        console.error(`${prefix} ${message}${paramsStr}`);
        break;
      case 'warning':
        console.warn(`${prefix} ${message}${paramsStr}`);
        break;
      default:
        console.log(`${prefix} ${message}${paramsStr}`);
    }
  }

  info(messageKey: string, params?: Record<string, any>, rawMessage?: string) {
    this.log('info', messageKey, params, rawMessage);
  }

  warning(messageKey: string, params?: Record<string, any>, rawMessage?: string) {
    this.log('warning', messageKey, params, rawMessage);
  }

  error(messageKey: string, params?: Record<string, any>, rawMessage?: string) {
    this.log('error', messageKey, params, rawMessage);
  }

  trade(messageKey: string, params?: Record<string, any>, rawMessage?: string) {
    this.log('trade', messageKey, params, rawMessage);
  }

  learning(messageKey: string, params?: Record<string, any>, rawMessage?: string) {
    this.log('learning', messageKey, params, rawMessage);
  }

  getLogs(filter?: LogFilter): LogEntry[] {
    let filteredLogs = [...this.logs];

    if (filter?.level) {
      filteredLogs = filteredLogs.filter(log => log.level === filter.level);
    }

    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.messageKey.toLowerCase().includes(searchLower) ||
        (log.rawMessage && log.rawMessage.toLowerCase().includes(searchLower)) ||
        (log.params && JSON.stringify(log.params).toLowerCase().includes(searchLower))
      );
    }

    return filteredLogs;
  }

  subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.logs]));
  }

  clearLogs() {
    this.logs = [];
    this.notifyListeners();
    this.saveStoredLogs();
  }

  private saveStoredLogs() {
    try {
      // Only save recent logs to prevent localStorage bloat
      const recentLogs = this.logs.slice(0, 50);
      localStorage.setItem('trading-bot-logs', JSON.stringify(recentLogs));
    } catch (error) {
      console.error('Failed to save logs to localStorage:', error);
    }
  }

  private loadStoredLogs() {
    try {
      const stored = localStorage.getItem('trading-bot-logs');
      if (stored) {
        this.logs = JSON.parse(stored);
        console.log(`📋 Loaded ${this.logs.length} stored log entries`);
      }
    } catch (error) {
      console.error('Failed to load stored logs:', error);
      this.logs = [];
    }
  }

  // Utility method to replace console.log calls
  static replaceConsoleLog(logService: LogService) {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      const message = args.join(' ');
      logService.info('console_log', {}, message);
      originalLog.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      logService.warning('console_warn', {}, message);
      originalWarn.apply(console, args);
    };

    console.error = (...args: any[]) => {
      const message = args.join(' ');
      logService.error('console_error', {}, message);
      originalError.apply(console, args);
    };
  }
}

export const logService = new LogService();