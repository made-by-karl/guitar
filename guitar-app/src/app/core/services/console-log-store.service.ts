import { Injectable, signal } from '@angular/core';

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace';

export interface ConsoleLogEntry {
  id: number;
  timestamp: string;
  level: ConsoleMethod;
  messageText: string;
  rawArgs: unknown[];
}

const CONSOLE_METHODS: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
const MAX_ENTRIES = 2000;

@Injectable({
  providedIn: 'root'
})
export class ConsoleLogStoreService {
  readonly entries = signal<ConsoleLogEntry[]>([]);
  private nextId = 1;
  private isInstalled = false;
  private readonly originalConsole: Partial<Record<ConsoleMethod, (...data: unknown[]) => void>> = {};

  installConsoleCapture(): void {
    if (this.isInstalled || typeof window === 'undefined') {
      return;
    }

    this.isInstalled = true;

    for (const method of CONSOLE_METHODS) {
      const original = window.console[method]?.bind(window.console);
      if (!original) {
        continue;
      }

      this.originalConsole[method] = original;
      window.console[method] = (...args: unknown[]) => {
        this.appendEntry(method, args);
        original(...args);
      };
    }
  }

  clear(): void {
    this.entries.set([]);
  }

  exportJson(): string {
    const snapshot = this.entries().map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      level: entry.level,
      messageText: entry.messageText,
      args: entry.rawArgs.map((arg) => this.safeSerializeArg(arg))
    }));
    return JSON.stringify(snapshot, null, 2);
  }

  private appendEntry(level: ConsoleMethod, args: unknown[]): void {
    const newEntry: ConsoleLogEntry = {
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      level,
      messageText: args.map((arg) => this.formatArg(arg)).join(' '),
      rawArgs: [...args]
    };

    this.entries.update((current) => {
      const updated = [...current, newEntry];
      if (updated.length <= MAX_ENTRIES) {
        return updated;
      }

      return updated.slice(updated.length - MAX_ENTRIES);
    });
  }

  private formatArg(arg: unknown): string {
    if (arg instanceof Error) {
      return arg.stack ?? `${arg.name}: ${arg.message}`;
    }
    if (typeof arg === 'string') {
      return arg;
    }
    if (arg === null) {
      return 'null';
    }
    if (typeof arg === 'undefined') {
      return 'undefined';
    }
    if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {
      return String(arg);
    }
    if (typeof arg === 'function') {
      return `[Function: ${arg.name || 'anonymous'}]`;
    }

    try {
      return JSON.stringify(arg);
    } catch {
      return Object.prototype.toString.call(arg);
    }
  }

  private safeSerializeArg(arg: unknown): unknown {
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: arg.message,
        stack: arg.stack
      };
    }
    if (typeof arg === 'function') {
      return `[Function: ${arg.name || 'anonymous'}]`;
    }
    if (typeof arg === 'bigint') {
      return arg.toString();
    }

    const seen = new WeakSet<object>();
    return JSON.parse(
      JSON.stringify(arg, (_key, value) => {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack
          };
        }
        if (typeof value === 'bigint') {
          return value.toString();
        }
        if (typeof value === 'function') {
          return `[Function: ${value.name || 'anonymous'}]`;
        }
        if (value && typeof value === 'object') {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        return value;
      })
    );
  }
}
