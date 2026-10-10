import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { cleanup, testConfig } from '../helpers/test-utils.js'
import { openDatabase } from '../../src/core/database.js'

test('opens and migrates a legacy sessions database', () => {
  const config = testConfig()
  const legacy = new Database(config.dbPath)
  legacy.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY,title TEXT,pdf_url TEXT,pdf_filename TEXT,pdf_text TEXT,pages INTEGER,created_at TEXT,accessed_at TEXT);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,role TEXT,content TEXT,created_at TEXT);
    INSERT INTO sessions VALUES ('legacy','Legacy Project','https://example.test/paper.pdf','paper.pdf','[Page 1]\nLegacy passage',1,'2020-01-01','2020-01-02');
    INSERT INTO messages(session_id,role,content,created_at) VALUES ('legacy','user','Question','2020-01-02');`)
  legacy.close()
  const db = openDatabase(config)
  try {
    assert.equal((db.prepare('SELECT COUNT(*) count FROM projects').get() as { count: number }).count, 1)
    assert.equal((db.prepare('SELECT COUNT(*) count FROM sources').get() as { count: number }).count, 1)
    assert.equal((db.prepare('SELECT COUNT(*) count FROM chat_messages').get() as { count: number }).count, 1)
    assert.equal((db.prepare('SELECT MAX(version) version FROM schema_migrations').get() as { version: number }).version, 11)
  } finally { cleanup(config, db) }
})

test('a fresh database provisions reading progress at schema version 11', () => {
  const config = testConfig()
  const db = openDatabase(config)
  try {
    assert.equal((db.prepare('SELECT MAX(version) version FROM schema_migrations').get() as { version: number }).version, 11)
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='collections'").get())
    assert.ok((db.prepare('PRAGMA table_info(annotations)').all()).some(c => c.name === 'note'))
    assert.ok((db.prepare('PRAGMA table_info(chat_messages)').all()).some(c => c.name === 'usage_json'))
    assert.ok((db.prepare('PRAGMA table_info(sources)').all() as Array<{ name: string }>).some(c => c.name === 'collection_id'))
    assert.ok((db.prepare('PRAGMA table_info(annotations)').all() as Array<{ name: string }>).some(c => c.name === 'rects'))
    const progress = (db.prepare("SELECT dflt_value FROM pragma_table_info('sources') WHERE name='last_page_read'").get() as { dflt_value: string })
    assert.equal(progress.dflt_value, '1')
  } finally { cleanup(config, db) }
})

test('adds the rects column when migrating a pre-existing annotations table', () => {
  const config = testConfig()
  const legacy = new Database(config.dbPath)
  legacy.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'Untitled Project', description TEXT DEFAULT '', created_at TEXT NOT NULL, accessed_at TEXT NOT NULL);
    CREATE TABLE sources (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'pdf', url TEXT, title TEXT, pdf_text TEXT, pages INTEGER DEFAULT 0, created_at TEXT NOT NULL, accessed_at TEXT NOT NULL);
    CREATE TABLE annotations (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, project_id TEXT NOT NULL, page_number INTEGER NOT NULL, x1 REAL NOT NULL, y1 REAL NOT NULL, x2 REAL NOT NULL, y2 REAL NOT NULL, text TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'yellow', created_at TEXT NOT NULL);
    INSERT INTO schema_migrations(version, applied_at) VALUES (1, datetime('now')), (2, datetime('now')), (3, datetime('now')), (4, datetime('now'));
    INSERT INTO projects VALUES ('p1','Old Project','','2020-01-01','2020-01-01');
    INSERT INTO sources VALUES ('s1','p1','pdf',NULL,'Paper',NULL,1,'2020-01-01','2020-01-01');
    INSERT INTO annotations(id,source_id,project_id,page_number,x1,y1,x2,y2,text,color,created_at) VALUES ('a1','s1','p1',1,0,0,1,1,'old highlight','yellow','2020-01-01');
  `)
  legacy.close()
  const db = openDatabase(config)
  try {
    assert.equal((db.prepare('SELECT MAX(version) version FROM schema_migrations').get() as { version: number }).version, 11)
    const row = db.prepare('SELECT rects FROM annotations WHERE id=?').get('a1') as { rects: string | null }
    assert.equal(row.rects, null)
  } finally { cleanup(config, db) }
})

test('drops a pre-existing artifacts table when migrating an older database', () => {
  const config = testConfig()
  const legacy = new Database(config.dbPath)
  legacy.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'Untitled Project', description TEXT DEFAULT '', created_at TEXT NOT NULL, accessed_at TEXT NOT NULL);
    CREATE TABLE artifacts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT DEFAULT 'Untitled Artifact', content TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO schema_migrations(version, applied_at) VALUES (1, datetime('now')), (2, datetime('now')), (3, datetime('now'));
    INSERT INTO projects VALUES ('p1','Old Project','','2020-01-01','2020-01-01');
    INSERT INTO artifacts VALUES ('a1','p1','Saved Output','Some content','2020-01-01','2020-01-01');
  `)
  legacy.close()
  const db = openDatabase(config)
  try {
    assert.equal((db.prepare('SELECT MAX(version) version FROM schema_migrations').get() as { version: number }).version, 11)
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='artifacts'").get(), undefined)
  } finally { cleanup(config, db) }
})

test('adds page progress to a version 5 database without changing existing sources', () => {
  const config = testConfig()
  const legacy = new Database(config.dbPath)
  legacy.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'Untitled Project', description TEXT DEFAULT '', created_at TEXT NOT NULL, accessed_at TEXT NOT NULL);
    CREATE TABLE sources (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'pdf', url TEXT, title TEXT, pdf_text TEXT, pages INTEGER DEFAULT 0, created_at TEXT NOT NULL, accessed_at TEXT NOT NULL);
    INSERT INTO schema_migrations(version, applied_at) VALUES
      (1, datetime('now')), (2, datetime('now')), (3, datetime('now')), (4, datetime('now')), (5, datetime('now'));
    INSERT INTO projects VALUES ('p1','Existing Project','','2020-01-01','2020-01-01');
    INSERT INTO sources VALUES ('s1','p1','pdf',NULL,'Existing Book',NULL,370,'2020-01-01','2020-01-01');
  `)
  legacy.close()

  const db = openDatabase(config)
  try {
    assert.equal((db.prepare('SELECT MAX(version) version FROM schema_migrations').get() as { version: number }).version, 11)
    const source = db.prepare('SELECT title,pages,last_page_read FROM sources WHERE id=?').get('s1') as { title: string; pages: number; last_page_read: number }
    assert.deepEqual(source, { title: 'Existing Book', pages: 370, last_page_read: 1 })
  } finally { cleanup(config, db) }
})
import fs from 'node:fs'
import path from 'node:path'
test('schema 10 upgrade backs up existing notes before adding ink tables',()=>{
 const config=testConfig(),db=openDatabase(config),time=new Date().toISOString()
 db.prepare('INSERT INTO projects(id,title,created_at,accessed_at) VALUES(?,?,?,?)').run('p','保留项目',time,time)
 db.prepare('INSERT INTO notes(id,project_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('n','p','保留笔记','旧正文',time,time)
 db.exec('DROP TABLE ink_documents; DROP TABLE ink_attachments; DELETE FROM schema_migrations WHERE version>10')
 db.close()
 const before=fs.readdirSync(config.backupsDir).length,upgraded=openDatabase(config)
 try{assert.equal((upgraded.prepare('SELECT content FROM notes WHERE id=?').get('n') as {content:string}).content,'旧正文');assert.equal(fs.readdirSync(config.backupsDir).length,before+1);const backups=fs.readdirSync(config.backupsDir).sort();const old=new Database(path.join(config.backupsDir,backups.at(-1)!));try{assert.equal((old.prepare('SELECT content FROM notes WHERE id=?').get('n') as {content:string}).content,'旧正文');assert.equal((old.prepare('SELECT MAX(version) n FROM schema_migrations').get() as {n:number}).n,10)}finally{old.close()}}finally{cleanup(config,upgraded)}
})
