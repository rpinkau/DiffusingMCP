import { EventEmitter } from 'events';

export class Log {
  private static events = new EventEmitter();

  static onLog(callback: (logEntry: any) => void) {
    this.events.on('log', callback);
  }

  static offLog(callback: (logEntry: any) => void) {
    this.events.off('log', callback);
  }

  static getTimestamp(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  static info(msg: string) {
    const formatted = `[${this.getTimestamp()}] [INFO] ${msg}`;
    console.log(formatted);
    this.events.emit('log', { type: 'info', message: formatted });
  }

  static error(msg: string, err?: any) {
    const formatted = `[${this.getTimestamp()}] [ERROR] ${msg}${err ? ': ' + (err.message || String(err)) : ''}`;
    console.error(formatted);
    this.events.emit('log', { type: 'error', message: formatted });
  }

  static warn(msg: string) {
    const formatted = `[${this.getTimestamp()}] [WARN] ${msg}`;
    console.warn(formatted);
    this.events.emit('log', { type: 'warn', message: formatted });
  }
}
