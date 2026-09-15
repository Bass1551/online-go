-- Up Migration: 001_initial_quote_stats.sql

CREATE TABLE IF NOT EXISTS quote_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS quote_game_rounds (
  round_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  username VARCHAR(64),
  mode VARCHAR(16) NOT NULL DEFAULT 'single', -- 'single' or 'multi'
  category VARCHAR(32) NOT NULL DEFAULT 'all',
  difficulty VARCHAR(32) NOT NULL DEFAULT 'mixed',
  score INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 10,
  status VARCHAR(16) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned', 'expired'
  rank INTEGER DEFAULT NULL,
  total_players INTEGER DEFAULT 1,
  total_correct_time_ms INTEGER NOT NULL DEFAULT 0,
  started_at BIGINT NOT NULL,
  finished_at BIGINT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_quote_rounds_user_status ON quote_game_rounds (user_id, status);

CREATE TABLE IF NOT EXISTS quote_game_answers (
  id VARCHAR(96) PRIMARY KEY,
  round_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  question_id VARCHAR(32) NOT NULL,
  choice_id VARCHAR(32) NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  response_time_ms INTEGER NOT NULL DEFAULT 0,
  server_timestamp BIGINT NOT NULL,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_round_user_question UNIQUE (round_id, user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_answers_round ON quote_game_answers (round_id);

CREATE TABLE IF NOT EXISTS quote_user_stats (
  user_id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64),
  completed_rounds INTEGER NOT NULL DEFAULT 0,
  high_score INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  total_correct_time_ms BIGINT NOT NULL DEFAULT 0,
  mp_wins INTEGER NOT NULL DEFAULT 0,
  mp_first INTEGER NOT NULL DEFAULT 0,
  mp_second INTEGER NOT NULL DEFAULT 0,
  mp_third INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS quote_user_category_stats (
  id VARCHAR(96) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  category VARCHAR(32) NOT NULL,
  total_questions INTEGER NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  CONSTRAINT uq_user_category UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_quote_cat_stats_user ON quote_user_category_stats (user_id);
