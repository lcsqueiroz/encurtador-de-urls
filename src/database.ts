import Database, { type Database as DatabaseType } from 'better-sqlite3';

const db: DatabaseType = new Database('banco.db');

db.pragma('foreign_keys = ON');

export function initDatabase(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS urls(
      code TEXT PRIMARY KEY,
      original_url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
    
    CREATE TABLE IF NOT EXISTS clicks(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_code TEXT NOT NULL,
      clicked_at INTEGER NOT NULL,
      FOREIGN KEY (url_code) REFERENCES urls(code) ON DELETE CASCADE
    );
  `);
  console.log('Tabelas criadas com sucesso.');
}

  

export { db };

