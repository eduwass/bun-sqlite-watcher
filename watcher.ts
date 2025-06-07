import { Database } from "bun:sqlite";
import type { 
  WatcherConfig, 
  DBChange, 
  WatcherCallback,
  WatchOptions,
  ErrorCallback
} from './types';
import { setupDatabase, createTriggers, removeTriggers, cleanup } from './utils/sqlite';
import { EventEmitter } from './utils/events';

export class TableWatcher<T = any> {
  private emitter: EventEmitter;
  private options: WatchOptions;
  private table: string;

  constructor(table: string, options: WatchOptions = {}) {
    this.table = table;
    this.options = options;
    this.emitter = new EventEmitter();
  }

  onInsert(callback: WatcherCallback<T>) {
    this.emitter.on('INSERT', callback);
    return this;
  }

  onUpdate(callback: WatcherCallback<T>) {
    this.emitter.on('UPDATE', callback);
    return this;
  }

  onDelete(callback: WatcherCallback<T>) {
    this.emitter.on('DELETE', callback);
    return this;
  }

  onAny(callback: WatcherCallback<T>) {
    this.emitter.on('*', callback);
    return this;
  }

  filter(predicate: (change: DBChange<T>) => boolean) {
    this.options.filter = predicate;
    return this;
  }

  async handleChange(change: DBChange<T>) {
    if (this.options.filter && !this.options.filter(change)) {
      return;
    }
    await this.emitter.emit(change.operation, change);
  }

  cleanup() {
    this.emitter.removeAllListeners();
  }
}

export class SQLiteWatcher {
  private db: Database;
  private config: Required<WatcherConfig>;
  private watchers: Map<string, TableWatcher>;
  private intervalId: number | null = null;
  private errorHandlers: Set<ErrorCallback>;
  private initialized: boolean = false;

  constructor(config: WatcherConfig) {
    this.config = {
      watchIntervalMs: 1000,
      maxChangesPerBatch: 1000,
      retentionSeconds: 3600,
      bufferSize: 10000,
      tables: [],
      ...config
    };

    this.db = new Database(this.config.dbPath);
    this.watchers = new Map();
    this.errorHandlers = new Set();
  }

  private initialize() {
    if (!this.initialized) {
      setupDatabase(this.db, this.config);
      this.initialized = true;
    }
  }

  watch<T = any>(table: string, options: WatchOptions = {}) {
    this.initialize();

    if (!this.watchers.has(table)) {
      createTriggers(this.db, table);
      this.watchers.set(table, new TableWatcher<T>(table, options));
    }
    return this.watchers.get(table) as TableWatcher<T>;
  }

  unwatch(table: string) {
    if (this.watchers.has(table)) {
      const watcher = this.watchers.get(table)!;
      watcher.cleanup();
      removeTriggers(this.db, table);
      this.watchers.delete(table);
    }
  }

  private async checkChanges() {
    try {
      const changes = this.db.query(`
        SELECT * FROM _sqlite_watcher_changes 
        ORDER BY timestamp ASC 
        LIMIT ?
      `).all(this.config.maxChangesPerBatch);

      if (changes.length > 0) {
        const lastId = changes[changes.length - 1].id;
        this.db.run('DELETE FROM _sqlite_watcher_changes WHERE id <= ?', lastId);

        for (const change of changes) {
          const watcher = this.watchers.get(change.table_name);
          if (watcher) {
            await watcher.handleChange({
              table: change.table_name,
              operation: change.operation,
              rowId: change.row_id,
              timestamp: change.timestamp,
              changes: JSON.parse(change.changed_data)
            });
          }
        }
      }
    } catch (error) {
      this.errorHandlers.forEach(handler => handler(error));
    }
  }

  start() {
    if (this.intervalId === null) {
      this.intervalId = setInterval(
        () => this.checkChanges(), 
        this.config.watchIntervalMs
      );
    }
    return this;
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    return this;
  }

  onError(handler: ErrorCallback) {
    this.errorHandlers.add(handler);
    return this;
  }

  cleanup(removeTable: boolean = false) {
    this.stop();
    
    // Remove all triggers and cleanup watchers
    for (const [table, watcher] of this.watchers.entries()) {
      watcher.cleanup();
      removeTriggers(this.db, table);
    }
    this.watchers.clear();

    if (removeTable) {
      cleanup(this.db);
    }

    this.db.close();
    this.initialized = false;
  }

  // Utility methods
  isWatching(table: string): boolean {
    return this.watchers.has(table);
  }

  get watchedTables(): string[] {
    return Array.from(this.watchers.keys());
  }

  async hasWatcherTable(): Promise<boolean> {
    const result = this.db.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name='_sqlite_watcher_changes'
    `).get();
    return !!result;
  }

  async getWatcherTableSize(): Promise<number> {
    const result = this.db.query(`
      SELECT COUNT(*) as count 
      FROM _sqlite_watcher_changes
    `).get();
    return (result as any).count;
  }
} 