# Tonton Studios Backend

FastAPI backend that powers the Tonton Studios audio separation app.

## Run

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API runs at http://localhost:8000. The frontend (Vite dev server) calls it
through the Vite proxy at `/api`.

## Endpoints

- `POST /api/upload` — upload an audio file (multipart form, field `file`). Returns `{ job_id, status, bpm }`.
- `GET /api/status/{job_id}` — returns job progress, status, bpm, and `files` when done.
- `GET /api/download/{job_id}/{file_type}` — downloads `lr`, `zip`, `rar`, or any stem name.
- `GET /` — health check.

## What it does

1. Loads the uploaded audio with librosa (44.1kHz mono).
2. Detects BPM with `librosa.beat.beat_track` (clamped 60–200).
3. Generates a click track synchronized to the detected BPM (downbeats at 1200Hz, offbeats at 800Hz, aligned to the first detected beat).
4. Separates 11 stems using Butterworth band-pass filters (baixo, bateria, voz, backings, sanfona, teclado, guitarra, metais, guia, regencia, click). Each stem is a genuinely different buffer so the mixer's Solo works.
5. Renders a stereo LR file (L = click + guia + regencia, R = instruments).
6. Packages a ZIP with the 11 stems and a second archive (saved as .rar) with 24 entries (Studio + Original variants + LR).
