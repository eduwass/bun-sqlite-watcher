export type TableOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface DBChange<T = any> {
  table: string;
  operation: TableOperation;
  rowId: number;
  timestamp: number;
  changes: T;
}

export interface WatcherConfig {
  dbPath: string;
  watchIntervalMs?: number;
  maxChangesPerBatch?: number;
  retentionSeconds?: number;
  bufferSize?: number;
  tables?: string[];
}

export interface WatchOptions {
  batch?: {
    size: number;
    timeoutMs: number;
  };
  filter?: (change: DBChange) => boolean;
}

export type WatcherCallback<T = any> = (change: DBChange<T>) => void | Promise<void>;
export type BatchCallback<T = any> = (changes: DBChange<T>[]) => void | Promise<void>;
export type ErrorCallback = (error: Error) => void | Promise<void>; 