import { Database } from "bun:sqlite";
import type { WatcherConfig } from '../types';

export function setupDatabase(db: Database, config: WatcherConfig) {
  // Enable WAL mode and other optimizations
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA synchronous=NORMAL');
  
  // Create our tracking table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS _sqlite_watcher_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      row_id INTEGER NOT NULL,
      changed_data TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_watcher_changes_timestamp 
    ON _sqlite_watcher_changes(timestamp);
    
    CREATE INDEX IF NOT EXISTS idx_watcher_changes_table 
    ON _sqlite_watcher_changes(table_name);
  `);

  // Setup cleanup trigger
  db.run(`
    CREATE TRIGGER IF NOT EXISTS cleanup_old_watcher_changes 
    AFTER INSERT ON _sqlite_watcher_changes
    BEGIN
      DELETE FROM _sqlite_watcher_changes 
      WHERE timestamp < unixepoch() - ${config.retentionSeconds || 3600}
      OR id <= (
        SELECT id FROM _sqlite_watcher_changes 
        ORDER BY id DESC 
        LIMIT 1 
        OFFSET ${config.bufferSize || 10000}
      );
    END;
  `);
}

export function createTriggers(db: Database, tableName: string) {
  // First check if triggers already exist
  const existingTriggers = db.query(`
    SELECT name FROM sqlite_master 
    WHERE type = 'trigger' 
    AND name LIKE '_sqlite_watcher_%${tableName}%'
  `).all();

  if (existingTriggers.length > 0) {
    removeTriggers(db, tableName);
  }

  // Get table columns for proper change tracking
  const tableInfo = db.query(`PRAGMA table_info(${tableName})`).all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: any;
    pk: number;
  }>;
  
  if (tableInfo.length === 0) {
    throw new Error(`Table '${tableName}' does not exist`);
  }

  // Find the primary key column
  const pkColumn = tableInfo.find(col => col.pk === 1);
  const pkColumnName = pkColumn ? pkColumn.name : 'rowid';

  // Build dynamic JSON object for all columns
  const columnPairs = tableInfo.map(col => `'${col.name}', new.${col.name}`).join(', ');

  // Create INSERT trigger
  db.run(`
    CREATE TRIGGER _sqlite_watcher_${tableName}_insert 
    AFTER INSERT ON ${tableName}
    BEGIN
      INSERT INTO _sqlite_watcher_changes (
        table_name, 
        operation, 
        row_id, 
        changed_data, 
        timestamp
      )
      VALUES (
        '${tableName}',
        'INSERT',
        new.${pkColumnName},
        json_object(${columnPairs}),
        unixepoch()
      );
    END;
  `);

  // Create UPDATE trigger
  db.run(`
    CREATE TRIGGER _sqlite_watcher_${tableName}_update 
    AFTER UPDATE ON ${tableName}
    BEGIN
      INSERT INTO _sqlite_watcher_changes (
        table_name, 
        operation, 
        row_id, 
        changed_data, 
        timestamp
      )
      VALUES (
        '${tableName}',
        'UPDATE',
        new.${pkColumnName},
        json_object(${columnPairs}),
        unixepoch()
      );
    END;
  `);

  // Create DELETE trigger - use old values for delete
  const oldColumnPairs = tableInfo.map(col => `'${col.name}', old.${col.name}`).join(', ');
  
  db.run(`
    CREATE TRIGGER _sqlite_watcher_${tableName}_delete 
    AFTER DELETE ON ${tableName}
    BEGIN
      INSERT INTO _sqlite_watcher_changes (
        table_name, 
        operation, 
        row_id, 
        changed_data, 
        timestamp
      )
      VALUES (
        '${tableName}',
        'DELETE',
        old.${pkColumnName},
        json_object(${oldColumnPairs}),
        unixepoch()
      );
    END;
  `);
}

export function removeTriggers(db: Database, tableName: string) {
  const triggers = [
    `_sqlite_watcher_${tableName}_insert`,
    `_sqlite_watcher_${tableName}_update`,
    `_sqlite_watcher_${tableName}_delete`
  ];

  for (const trigger of triggers) {
    db.run(`DROP TRIGGER IF EXISTS ${trigger}`);
  }
}

export function cleanup(db: Database) {
  // Remove all our triggers and tables
  db.run(`
    DROP TABLE IF EXISTS _sqlite_watcher_changes;
    DROP TRIGGER IF EXISTS cleanup_old_watcher_changes;
  `);
} 