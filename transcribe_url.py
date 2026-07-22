#!/usr/bin/env python3
"""Transcribe a video/audio URL or a local media file locally with Whisper.
Nothing leaves this machine. URLs go through yt-dlp first (YouTube, TikTok,
Instagram, etc.); an existing local file path is transcribed directly.

Usage: transcribe_url.py <url-or-file> [--model base] [--lang en] [--keep]
"""
import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import whisper
from yt_dlp import YoutubeDL

DEFAULT_WHISPER_CACHE = "/Users/r/Documents/content generation/.cache/whisper"


def format_ts(seconds):
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}"


def compute_frame_timestamps(duration, dense_window=3.0, dense_step=0.5, sparse_step=2.0):
    timestamps = []
    t = 0.0
    while t < min(dense_window, duration):
        timestamps.append(round(t, 2))
        t += dense_step
    t = dense_window
    while t < duration:
        timestamps.append(round(t, 2))
        t += sparse_step
    return timestamps



def get_media_duration(media_path):
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(media_path),
        ],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def extract_frames(media_path, out_dir, thumbnail_path=None):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = get_media_duration(media_path)
    timestamps = compute_frame_timestamps(duration)
    frame_paths = []
    for i, ts in enumerate(timestamps):
        frame_path = out_dir / f"frame_{i:03d}_{ts:.1f}s.jpg"
        subprocess.run(
            [
                "ffmpeg", "-y", "-ss", str(ts), "-i", str(media_path),
                "-frames:v", "1", "-q:v", "2", str(frame_path),
            ],
            capture_output=True, check=True,
        )
        frame_paths.append(frame_path)
    if thumbnail_path and Path(thumbnail_path).is_file():
        real_thumb = out_dir / f"thumbnail_real{Path(thumbnail_path).suffix}"
        real_thumb.write_bytes(Path(thumbnail_path).read_bytes())
        frame_paths.append(real_thumb)
    return frame_paths


def find_downloaded_thumbnail(media_path):
    media_path = Path(media_path)
    for candidate in media_path.parent.glob(f"{media_path.stem}.*"):
        if candidate != media_path and candidate.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            return candidate
    return None


def download_media(url, out_dir, browser=None, want_thumbnail=False):
    outtmpl = str(Path(out_dir) / "%(id)s.%(ext)s")
    opts = {
        # Some platforms (e.g. TikTok's bytevc1/h265 variants) advertise an
        # audio track that isn't actually present in the fetched file, so
        # prefer plain h264 first, then fall back to a video+audio merge,
        # then whatever "best" resolves to.
        "format": "best[vcodec^=avc1]/best[vcodec^=h264]/bestvideo+bestaudio/best",
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": True,
    }
    if browser:
        opts["cookiesfrombrowser"] = (browser, None, None, None)
    if want_thumbnail:
        opts["writethumbnail"] = True
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return Path(ydl.prepare_filename(info))


def transcribe_and_print(media_path, model_name, lang, cache_root):
    print(f"Transcribing with Whisper ({model_name}) ...", file=sys.stderr)
    model = whisper.load_model(model_name, download_root=cache_root)
    result = model.transcribe(str(media_path), language=lang, word_timestamps=False)

    print("## Transcript\n")
    print("### Timestamped")
    for seg in result["segments"]:
        print(f"[{format_ts(seg['start'])}] {seg['text'].strip()}")
    print("\n### Full Text")
    print(result["text"].strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="a URL, or a path to a local video/audio file")
    parser.add_argument("--model", default="base")
    parser.add_argument("--lang", default=None)
    parser.add_argument("--keep", action="store_true", help="keep the downloaded media file in the current directory")
    parser.add_argument("--browser", default=None, help="read cookies from this browser (e.g. chrome) for login-walled sites like Instagram")
    parser.add_argument("--frames", default=None, help="directory to extract sampled frames (and real thumbnail, if available) into")
    args = parser.parse_args()

    cache_root = os.environ.get("WHISPER_CACHE", DEFAULT_WHISPER_CACHE)

    local_path = Path(args.source).expanduser()
    if local_path.is_file():
        print(f"Transcribing local file {local_path} ...", file=sys.stderr)
        if args.frames:
            try:
                extract_frames(local_path, args.frames)
            except (subprocess.CalledProcessError, ValueError, OSError) as e:
                print(f"Frame extraction failed: {e} — continuing with audio-only transcription", file=sys.stderr)
        transcribe_and_print(local_path, args.model, args.lang, cache_root)
        return

    with tempfile.TemporaryDirectory() as tmp:
        print(f"Downloading {args.source} ...", file=sys.stderr)
        media_path = download_media(args.source, tmp, browser=args.browser, want_thumbnail=bool(args.frames))
        if args.frames:
            try:
                thumbnail_path = find_downloaded_thumbnail(media_path)
                extract_frames(media_path, args.frames, thumbnail_path=thumbnail_path)
            except (subprocess.CalledProcessError, ValueError, OSError) as e:
                print(f"Frame extraction failed: {e} — continuing with audio-only transcription", file=sys.stderr)
        transcribe_and_print(media_path, args.model, args.lang, cache_root)

        if args.keep:
            dest = Path.cwd() / media_path.name
            media_path.replace(dest)
            print(f"\nSaved media to {dest}", file=sys.stderr)


if __name__ == "__main__":
    main()
