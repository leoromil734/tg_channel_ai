import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const dbPath = process.env.DB_PATH ?? './data/channel_ai.db'
mkdirSync(dirname(dbPath), { recursive: true })

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const migrate = () => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_channel_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      user_intro TEXT DEFAULT '',
      schedule_cron TEXT DEFAULT '0 9 * * *',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      provider_type TEXT NOT NULL CHECK(provider_type IN ('openai','anthropic','gemini','deepseek','openai_compatible')),
      api_key TEXT NOT NULL,
      base_url TEXT DEFAULT '',
      is_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      step_type TEXT NOT NULL CHECK(step_type IN ('brain','researcher','writer','prompter','illustrator','reviewer')),
      step_order INTEGER NOT NULL DEFAULT 0,
      provider_id INTEGER REFERENCES ai_providers(id) ON DELETE SET NULL,
      model TEXT NOT NULL DEFAULT '',
      system_prompt TEXT DEFAULT '',
      temperature REAL DEFAULT 0.8,
      max_tokens INTEGER DEFAULT 2048,
      is_enabled INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipeline_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      search_enabled INTEGER DEFAULT 1,
      search_query_template TEXT DEFAULT '',
      image_enabled INTEGER DEFAULT 1,
      custom_instructions TEXT DEFAULT '',
      content_style TEXT DEFAULT 'informative',
      language TEXT DEFAULT 'zh',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed')),
      trigger_type TEXT DEFAULT 'manual' CHECK(trigger_type IN ('auto','manual','preview')),
      current_step TEXT DEFAULT '',
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );


    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      level TEXT DEFAULT 'info' CHECK(level IN ('info','warn','error')),
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      text_content TEXT NOT NULL,
      image_url TEXT,
      image_prompt TEXT,
      search_keywords TEXT,
      search_results TEXT,
      tg_message_id TEXT,
      is_preview INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)
  // Add columns introduced after initial schema (safe to run on existing DBs)
  const alterations = [
    `ALTER TABLE tasks ADD COLUMN current_step TEXT DEFAULT ''`,
    `ALTER TABLE ai_providers ADD COLUMN default_model TEXT DEFAULT ''`,
    `ALTER TABLE channels ADD COLUMN schedule_once TEXT DEFAULT ''`,
  ]
  for (const stmt of alterations) {
    try { sqlite.exec(stmt) } catch { /* column already exists */ }
  }

  console.log('Database migration completed.')
}

migrate()
sqlite.close()
