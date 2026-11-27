-- Madrasti initial database schema (Cloudflare D1 / SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  display_name TEXT,
  gender_preference TEXT NOT NULL DEFAULT 'neutral' CHECK (gender_preference IN ('neutral','boy','girl')),
  grade TEXT NOT NULL,
  avatar_id TEXT NOT NULL DEFAULT 'child-neutral',
  voice_id TEXT NOT NULL DEFAULT 'ar-default',
  daily_lessons_per_subject INTEGER NOT NULL DEFAULT 1 CHECK (daily_lessons_per_subject BETWEEN 1 AND 10),
  child_pin_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_children_parent ON children(parent_id);

CREATE TABLE IF NOT EXISTS curricula (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  country_or_authority TEXT,
  grade TEXT NOT NULL,
  subject TEXT NOT NULL,
  edition TEXT,
  visibility TEXT NOT NULL DEFAULT 'library' CHECK (visibility IN ('library','private')),
  owner_parent_id TEXT REFERENCES parents(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  curriculum_id TEXT REFERENCES curricula(id) ON DELETE SET NULL,
  owner_parent_id TEXT REFERENCES parents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  pdf_object_key TEXT,
  processing_status TEXT NOT NULL DEFAULT 'uploaded' CHECK (processing_status IN ('uploaded','processing','needs_review','approved','failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  page_start INTEGER,
  page_end INTEGER,
  UNIQUE(book_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  source_pages TEXT,
  lesson_content TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft','reviewed','approved')),
  UNIQUE(unit_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options_json TEXT,
  answer_key TEXT,
  feedback_json TEXT,
  sequence_no INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS child_subjects (
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  curriculum_id TEXT REFERENCES curricula(id) ON DELETE SET NULL,
  PRIMARY KEY(child_id, subject)
);

CREATE TABLE IF NOT EXISTS learning_plans (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  lessons_per_day INTEGER NOT NULL DEFAULT 1 CHECK (lessons_per_day BETWEEN 1 AND 10),
  weekdays_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  timezone TEXT NOT NULL DEFAULT 'Asia/Baghdad',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(child_id, subject)
);

CREATE TABLE IF NOT EXISTS progress (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed')),
  score REAL,
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(child_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS activity_attempts (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  response_json TEXT,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES parents(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
