# SQLite Watcher

A high-performance SQLite change tracking library for Bun that provides real-time notifications for database modifications. It offers type-safe event handling and can detect changes made by any process or connection to your SQLite database.

Built with performance and developer experience in mind, SQLite Watcher makes it easy to react to database changes in your Bun applications with minimal overhead.

## Features

- 🚀 High-performance change tracking using SQLite triggers
- 📦 Zero dependencies (uses Bun's built-in SQLite)
- 💪 Full TypeScript support with type-safe events
- 🔄 Real-time change notifications
- 🛡️ Safe concurrent access with WAL mode
- 🎯 Chainable API with event filtering
- 🧹 Automatic cleanup of old changes
- 📊 Support for batch processing

## Installation

```bash
bun add bun-sqlite-watcher
```

## Quick Start

```typescript
import { SQLiteWatcher } from 'bun-sqlite-watcher';

// Initialize the watcher
const watcher = new SQLiteWatcher({
  dbPath: "myapp.sqlite"
});

// Watch a table with type safety
interface User {
  id: number;
  name: string;
  email: string;
}

watcher.watch<User>('users')
  .onInsert(change => {
    console.log(`New user: ${change.changes.name}`);
  })
  .onUpdate(change => {
    console.log(`User updated: ${change.changes.name}`);
  })
  .onDelete(change => {
    console.log(`User deleted: ID ${change.rowId}`);
  });

// Start watching
watcher.start();

// Cleanup when done
watcher.cleanup();
```

## Configuration

```typescript
const watcher = new SQLiteWatcher({
  dbPath: "myapp.sqlite",        // Path to your SQLite database
  watchIntervalMs: 1000,         // How often to check for changes (default: 1000ms)
  maxChangesPerBatch: 1000,      // Maximum changes to process at once (default: 1000)
  retentionSeconds: 3600,        // How long to keep changes (default: 1 hour)
  bufferSize: 10000             // Maximum number of changes to buffer (default: 10000)
});
```

## Advanced Usage

### Filtering Changes

```typescript
watcher.watch<User>('users')
  .filter(change => change.changes.role === 'admin')
  .onAny(change => {
    console.log(`Admin user changed: ${change.changes.name}`);
  });
```

### Error Handling

```typescript
watcher
  .onError(error => {
    console.error('Watcher error:', error);
  })
  .watch('users')
  .onAny(change => {
    // Handle changes
  });
```

### Multiple Tables

```typescript
// Watch multiple tables with different handlers
const tables = {
  users: {
    onInsert: notifyNewUser,
    onDelete: cleanupUserData
  },
  posts: {
    onUpdate: reindexPost,
    onDelete: removeFromCDN
  }
};

Object.entries(tables).forEach(([table, handlers]) => {
  watcher.watch(table)
    .onInsert(handlers.onInsert)
    .onDelete(handlers.onDelete);
});
```

### Utility Methods

```typescript
// Check if a table is being watched
console.log(watcher.isWatching('users'));

// Get list of watched tables
console.log(watcher.watchedTables);

// Get watcher table size
const size = await watcher.getWatcherTableSize();
```

### Cleanup

```typescript
// Stop watching and remove triggers
watcher.cleanup();

// Stop watching, remove triggers and watcher table
watcher.cleanup(true);
```

## How It Works

The watcher creates a special table `_sqlite_watcher_changes` to track changes and sets up triggers on your tables. When a change occurs:

1. The trigger adds a record to the watcher table
2. The watcher periodically checks for new changes
3. Changes are processed and emitted to your handlers
4. Processed changes are automatically cleaned up

The watcher uses WAL mode for better performance and concurrent access.

## Best Practices

1. Always call `cleanup()` when you're done watching
2. Use type parameters for type safety
3. Handle errors with `onError()`
4. Use filters to reduce unnecessary processing
5. Adjust `watchIntervalMs` based on your needs
6. Set appropriate `retentionSeconds` and `bufferSize`

## Security & Performance Considerations

### Security
1. **Access Control**: Ensure proper file permissions on the SQLite database file to prevent unauthorized access
2. **SQL Injection**: While the watcher uses prepared statements internally, be cautious with any custom SQL you execute
3. **Resource Exhaustion**: Set appropriate `bufferSize` and `maxChangesPerBatch` limits to prevent memory issues
4. **Trigger Permissions**: External tools or users need proper permissions to modify watched tables

### Performance
1. **Watch Interval**: Lower `watchIntervalMs` means faster updates but higher CPU usage
2. **Change Volume**: High-frequency changes can impact performance; consider batch processing
3. **Database Size**: Large watcher tables can slow down queries; adjust `retentionSeconds`
4. **Concurrent Access**: While WAL mode helps, heavy write loads may impact watcher performance
5. **Memory Usage**: Monitor `bufferSize` in high-change environments
6. **Trigger Overhead**: Each watched table adds triggers that slightly impact write performance

## License

MIT 