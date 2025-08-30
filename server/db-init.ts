import {Database} from 'bun:sqlite';

const dbFile = 'server/moebius.db';
const db = new Database(dbFile);

db.run(`
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  canvas_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  ws_id TEXT,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);
`);

db.run(`
CREATE TABLE IF NOT EXISTS canvases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  font TEXT NOT NULL,
  spacing INTEGER NOT NULL,
  ice INTEGER NOT NULL,
  colors TEXT NOT NULL,
  rawdata BLOB NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  room_id INTEGER,
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);
`);

db.run(`
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  msg TEXT NOT NULL,
  type INTEGER NOT NULL, -- 0 = server, 1 = user
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);
`);

db.run(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER,
  user_id INTEGER,
  action TEXT,
  payload TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES rooms(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

console.log(`SQLite DB "${dbFile}" initialized with all tables!`);
db.close();
