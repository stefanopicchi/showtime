-- ShowTime: schema database (Cloudflare D1 / SQLite)

-- Cache dei titoli da TMDB (condivisa, una riga per lingua)
CREATE TABLE IF NOT EXISTS titles (
  media_type TEXT NOT NULL,            -- 'movie' | 'tv'
  tmdb_id INTEGER NOT NULL,
  lang TEXT NOT NULL,                  -- 'it-IT' | 'en-US'
  title TEXT NOT NULL,
  original_title TEXT,
  year INTEGER,
  poster_path TEXT,
  overview TEXT,
  runtime INTEGER,                     -- film: durata; serie: durata media episodio
  genres TEXT NOT NULL DEFAULT '[]',   -- JSON [{id,name}]
  actors TEXT NOT NULL DEFAULT '[]',   -- JSON [{id,name}] (primi 10)
  directors TEXT NOT NULL DEFAULT '[]',-- JSON [{id,name}] (registi / ideatori)
  tv_status TEXT,
  seasons INTEGER,
  episodes_aired INTEGER,              -- episodi gia' usciti (esclusi speciali)
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (media_type, tmdb_id, lang)
);

-- Episodi delle serie (cache TMDB)
CREATE TABLE IF NOT EXISTS episodes (
  show_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  name TEXT,
  runtime INTEGER,
  air_date TEXT,
  PRIMARY KEY (show_id, season, episode)
);

-- Ogni riga = una visione (film o episodio). Piu' visioni = rivisioni.
CREATE TABLE IF NOT EXISTS views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  media_type TEXT NOT NULL,            -- 'movie' | 'episode'
  tmdb_id INTEGER NOT NULL,            -- id del film, oppure id della serie per gli episodi
  season INTEGER,
  episode INTEGER,
  watched_at TEXT,                     -- AAAA-MM-GG, facoltativa
  rating INTEGER,                      -- 1-10, facoltativo (solo film)
  src TEXT,                            -- origine import (evita doppioni)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS views_user ON views (user_id, media_type, tmdb_id);
CREATE UNIQUE INDEX IF NOT EXISTS views_src ON views (user_id, src) WHERE src IS NOT NULL;

CREATE TABLE IF NOT EXISTS watchlist (
  user_id TEXT NOT NULL,
  media_type TEXT NOT NULL,            -- 'movie' | 'tv'
  tmdb_id INTEGER NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, media_type, tmdb_id)
);

-- Stato e voto personale delle serie
CREATE TABLE IF NOT EXISTS user_shows (
  user_id TEXT NOT NULL,
  tmdb_id INTEGER NOT NULL,
  status TEXT,                         -- watching | completed | paused | dropped
  rating INTEGER,
  PRIMARY KEY (user_id, tmdb_id)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  lang TEXT NOT NULL DEFAULT 'it-IT'
);
