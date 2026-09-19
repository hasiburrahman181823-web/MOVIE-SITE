const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'cinenova.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  genre TEXT DEFAULT 'Drama',
  year INTEGER,
  duration TEXT DEFAULT '',
  poster_url TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  video_path TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  PRIMARY KEY(user_id, movie_id)
);
CREATE TABLE IF NOT EXISTS ratings (
  user_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, movie_id)
);
CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  seconds REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, movie_id)
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY,
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  preferences TEXT DEFAULT '{}'
);
`);

const adminEmail = process.env.ADMIN_EMAIL || 'admin@cinenova.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
const existingAdmin = db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail);
if (!existingAdmin) {
  db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)')
    .run('CineNova Admin', adminEmail, bcrypt.hashSync(adminPassword, 12), 'admin');
}

const count = db.prepare('SELECT COUNT(*) AS c FROM movies').get().c;
if (!count) {
  const seed = db.prepare(`INSERT INTO movies
    (title,description,genre,year,duration,poster_url,video_url,status)
    VALUES(?,?,?,?,?,?,?,?)`);
  [
    ['The Last Horizon','A crew searches for a lost world beyond the stars.','Sci-Fi',2026,'2h 08m','https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=900','https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4','published'],
    ['Neon Reverie','A detective follows clues through a futuristic city.','Thriller',2025,'1h 52m','https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=900','https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4','published'],
    ['After Midnight','Two strangers discover a secret after the city sleeps.','Drama',2024,'1h 44m','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900','https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4','published']
  ].forEach(m => seed.run(...m));
}
module.exports = db;
