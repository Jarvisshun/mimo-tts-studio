# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TTS Voxa is an AI voice companion app powered by Xiaomi MiMo TTS models. It runs as a Windows desktop exe (PyInstaller + pywebview) and Android APK (Capacitor 6). The app lets users clone voices from audio samples, design virtual voices from text descriptions, and generate speech with emotion/speed control.

## Build & Dev Commands

### Frontend (React + TypeScript)
```bash
cd frontend
npm install
npm run dev          # Dev server at localhost:5173, proxies /api to localhost:8000
npm run build        # tsc -b && vite build → dist/
npm run lint         # ESLint
```

### Backend (Python FastAPI)
```bash
cd backend
pip install -r requirements.txt
python main.py       # Starts uvicorn on port 8000-8020
```

### Desktop exe build
```bash
cd backend
python build.py      # PyInstaller --onedir --windowed → dist/TTS Voxa/
```

### Android build
```bash
cd frontend
npm run build
npx cap sync android
# Then open Android Studio or run gradlew
cd android && ./gradlew.bat assembleRelease
# APK → android/app/build/outputs/apk/release/app-release.apk
```

### Release process
1. Bump version in `VERSION` and `frontend/package.json`
2. Build frontend, then desktop exe, then Android APK
3. Copy APK to `releases/android/`
4. Zip exe folder to `releases/win64/`
5. `git commit && git push`
6. `gh release create v<version>` with both zip and apk as assets

## Architecture

### Dual-mode client (`frontend/src/api/client.ts`)
The biggest architectural pattern: `client.ts` dispatches every data operation based on `useLocalDb()` (checks if jeep-sqlite element exists in DOM):
- **Local DB available** (desktop with jeep-sqlite, Android with Capacitor SQLite): reads/writes local SQLite, sync pushes to Supabase
- **Local DB not available**: falls back to backend server HTTP API (`/api/...`)

TTS synthesis, voice clone, and voice design always go through the platform-appropriate path: `isNative()` routes to `mimoApi.ts` (direct MiMo API calls from client), while desktop routes to the backend server which proxies to MiMo.

### Backend routers (`backend/routers/`)
Each module is a FastAPI APIRouter: `tts.py`, `clone.py`, `design.py`, `batch.py`, `voices.py`, `history.py`, `config.py`. All MiMo API calls go through `services/mimo_client.py` using httpx to the OpenAI-compatible chat completions endpoint.

### Database
- **Backend** (`models/database.py`): SQLite via aiosqlite, WAL mode, 5 tables (voices, generations, batch_jobs, batch_items, providers)
- **Frontend** (`db/database.ts` + `db/schema.ts`): Same 5 tables via jeep-sqlite (desktop) or @capacitor-community/sqlite (Android). Schema has `user_id`, `updated_at`, `synced` columns for Supabase sync.
- **Migrations**: `ALTER TABLE ADD COLUMN` with silent failure if column exists.

### Cloud sync (`db/sync.ts` + `api/supabase.ts`)
Offline-first: local SQLite is primary. `syncAll()` does push then pull. Push only sends rows with `synced=0`. Pull merges remote rows (last-write-wins by `updated_at`). Audio files encrypted with AES-GCM-256 before upload. Supabase auth supports email/password, registration, magic link.

### Platform detection (`platform.ts`)
- `isNative()`: `window.Capacitor?.isNativePlatform` — true on Android
- `useLocalDb()`: `!!document.querySelector('jeep-sqlite')` — true when local SQLite is initialized (both desktop and native)

### Key frontend files
- `main.tsx`: Bootstraps jeep-sqlite, initializes database, auto-syncs with Supabase, mounts React
- `App.tsx`: Sidebar layout with `TaskContext` provider
- `pages/Settings.tsx`: Auth UI (login/register/magic link), Supabase config, provider management, version update
- `components/WaveformPlayer.tsx`: WaveSurfer.js audio player used everywhere
- `components/AudioRecorder.tsx`: Web MediaRecorder with device selection; Android uses custom `MicrophonePlugin`

### Android native (`frontend/android/`)
- `MainActivity.java`: Registers `MicrophonePlugin`, sets up file chooser, crash handler
- `MicrophonePlugin.java`: Custom Capacitor plugin using Android MediaRecorder (AAC 44100Hz), returns base64 audio

## Version Management

Single source of truth: `VERSION` file at project root. Read by:
- `backend/main.py` → `__version__` for `/api/version` endpoint
- `frontend/vite.config.ts` → `__APP_VERSION__` define for native app
- `frontend/android/app/build.gradle` → `versionName` and `versionCode` (auto-calculated from semver)

## Environment & Config

- Backend `.env`: `MIMO_API_KEY`, `MIMO_API_BASE` (defaults to `https://token-plan-cn.xiaomimimo.com/v1`)
- Frontend stores API keys in local SQLite `providers` table (not localStorage)
- Supabase URL/key stored in `localStorage` (`supabase_url`, `supabase_key`)
- Dev proxy: Vite proxies `/api` to `http://localhost:8000`

## MiMo API Models

| Model | Purpose |
|-------|---------|
| `mimo-v2.5-tts` | Standard TTS |
| `mimo-v2.5-tts-voiceclone` | Voice clone from reference audio |
| `mimo-v2.5-tts-voicedesign` | Voice design from text description |

All use OpenAI-compatible `/chat/completions` with `modalities: ["text", "audio"]`. Voice clone passes reference audio as base64 DataURL in `audio.voice`. Emotion is injected as a user message `"用{emotion}语气说"`.

## Gotchas

- `jeep-sqlite` must be loaded from local npm package, not CDN (blocked in China)
- `@capacitor/share` must match Capacitor major version (6.x for Capacitor 6)
- Desktop exe uses `--onedir` mode; `static/` dir must be in `_internal/` or alongside exe
- Android ProGuard rules in `android/app/proguard-rules.pro` keep Capacitor, SQLCipher, Room classes
- The `releases/` directory is gitignored — binaries go to GitHub Releases only
- `.spec` files are gitignored (auto-generated by PyInstaller)
