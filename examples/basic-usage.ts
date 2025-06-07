import { Database } from "bun:sqlite";
import { SQLiteWatcher } from "bun-sqlite-watcher";

// Create a test database
const db = new Database("test.sqlite");

// Create a test table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

// Define our User type
interface User {
  id: number;
  name: string;
  email: string;
  created_at: number;
}

// Initialize the watcher
const watcher = new SQLiteWatcher({
  dbPath: "test.sqlite",
  watchIntervalMs: 1000
});

// Watch the users table with type safety
watcher.watch<User>('users')
  .onInsert(change => {
    console.log(`New user created: ${change.changes.name} (${change.changes.email})`);
  })
  .onUpdate(change => {
    console.log(`User updated: ${change.changes.name}`);
  })
  .onDelete(change => {
    console.log(`User deleted: ID ${change.rowId}`);
  })
  .onAny(change => {
    console.log(`[${change.operation}] Change detected at ${new Date(change.timestamp * 1000)}`);
  });

// Start watching for changes
watcher.start();

// Make some test changes
db.run(
  "INSERT INTO users (name, email) VALUES (?, ?)", 
  ["John Doe", "john@example.com"]
);

db.run(
  "UPDATE users SET name = ? WHERE email = ?",
  ["John Smith", "john@example.com"]
);

db.run(
  "DELETE FROM users WHERE email = ?",
  ["john@example.com"]
);

// Cleanup on exit
process.on('SIGINT', () => {
  watcher.cleanup(true);
  process.exit(0);
}); 