-- Run this in Supabase SQL Editor to create the shared_voices table for the voice marketplace

CREATE TABLE IF NOT EXISTS shared_voices (
  id TEXT PRIMARY KEY,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('clone', 'design')),
  voice_config JSONB DEFAULT '{}',
  preview_audio_url TEXT,
  category TEXT DEFAULT 'other' CHECK (category IN ('female', 'male', 'child', 'special', 'other')),
  tags TEXT[] DEFAULT '{}',
  downloads INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_featured BOOLEAN DEFAULT FALSE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_voices_category ON shared_voices(category);
CREATE INDEX IF NOT EXISTS idx_shared_voices_created ON shared_voices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_voices_likes ON shared_voices(likes DESC);
CREATE INDEX IF NOT EXISTS idx_shared_voices_author ON shared_voices(author_id);

-- RLS: everyone can read, only author can modify/delete
ALTER TABLE shared_voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_voices_select_all" ON shared_voices
  FOR SELECT USING (true);

CREATE POLICY "shared_voices_insert_own" ON shared_voices
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "shared_voices_update_own" ON shared_voices
  FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "shared_voices_delete_own" ON shared_voices
  FOR DELETE USING (auth.uid() = author_id);
