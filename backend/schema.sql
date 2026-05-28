PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user')) DEFAULT 'user',
  department TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Summary',
  context_prompt TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'generating', 'published')) DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(created_by) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_panels (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  panel_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  narrative_text TEXT NOT NULL DEFAULT '',
  narration_audio_url TEXT,
  narration_duration_ms INTEGER,
  image_url TEXT,
  image_prompt TEXT NOT NULL DEFAULT '',
  panel_type TEXT NOT NULL CHECK(panel_type IN ('cover', 'narration', 'dialogue', 'action', 'summary')) DEFAULT 'narration',
  character_name TEXT NOT NULL DEFAULT '',
  character_dialogue TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE,
  FOREIGN KEY(uploaded_by) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_reads (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_panel_read INTEGER NOT NULL DEFAULT 1,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(story_id, user_id),
  FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_created_by ON stories(created_by);
CREATE INDEX IF NOT EXISTS idx_story_panels_story_id ON story_panels(story_id);
CREATE INDEX IF NOT EXISTS idx_story_reads_user_id ON story_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_story_id ON documents(story_id);
