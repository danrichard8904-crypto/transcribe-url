# transcribe-url

Give it any yt-dlp-supported URL — YouTube, TikTok, Instagram, etc. — and it downloads the media and transcribes it locally with Whisper. Nothing is uploaded anywhere.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt "yt-dlp[default,curl-cffi]"
```

`curl-cffi` is required for sites (like Instagram) that block yt-dlp unless it can impersonate a real browser's TLS fingerprint.

## Usage

```bash
./transcribe.sh <url>
./transcribe.sh <url> --model small   # bigger model, better accuracy, slower
./transcribe.sh <url> --keep          # also save the downloaded media file
```

Output matches the same "Timestamped" + "Full Text" format used elsewhere for transcripts.

### Frame extraction

Pass `--frames <dir>` to also pull sampled stills alongside the transcript — dense sampling (every 0.5s) for the first 3 seconds (the hook window), then one frame every 2 seconds after, plus the platform's real thumbnail when yt-dlp can fetch one (reliable on YouTube, best-effort on TikTok/Instagram). If frame extraction fails, transcription still completes — a warning prints to stderr instead of aborting the run.

```bash
./transcribe.sh <url> --frames ./frames
```

## Platform notes

- **YouTube** — works.
- **TikTok** — works. Some TikTok formats advertise an audio track that isn't actually present in the served file (a `bytevc1`/h265 quirk); the format selector prefers plain `h264` first to avoid that.
- **Instagram** — currently blocked without login: Instagram returns an empty response for anonymous requests on many posts. Fix would be `--cookies-from-browser` (pull cookies from a real logged-in browser session) — not wired up yet, since it means yt-dlp authenticates as your actual Instagram account, which carries some risk of the account getting rate-limited or challenged if used heavily. Ask if you want this added.

## Whisper model cache

Reuses the same model cache as Clipzi Local (`../.cache/whisper` by default, override with `WHISPER_CACHE`), so the `base` model already downloaded there doesn't get fetched twice.
