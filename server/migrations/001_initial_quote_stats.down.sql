-- Down Migration: 001_initial_quote_stats.down.sql

DROP TABLE IF EXISTS quote_user_category_stats CASCADE;
DROP TABLE IF EXISTS quote_user_stats CASCADE;
DROP TABLE IF EXISTS quote_game_answers CASCADE;
DROP TABLE IF EXISTS quote_game_rounds CASCADE;
DELETE FROM quote_schema_migrations WHERE version = 1;
