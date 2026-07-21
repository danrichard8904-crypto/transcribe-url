#!/usr/bin/env python3
"""Transcribe a video/audio URL or a local media file locally with Whisper.
Nothing leaves this machine. URLs go through yt-dlp first (YouTube, TikTok,
Instagram, etc.); an existing local file path is transcribed directly.

Usage: transcribe_url.py <url-or-file> [--model base] [--lang en] [--keep]
"""
import argparse
import os
import sys
import tempfile
from pathlib import Path

import whisper
from yt_dlp import YoutubeDL

DEFAULT_WHISPER_CACHE = "/Users/r/Documents/content generation/.cache/whisper"


def format_ts(seconds):
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}"


def download_media(url, out_dir, browser=None):
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
    args = parser.parse_args()

    cache_root = os.environ.get("WHISPER_CACHE", DEFAULT_WHISPER_CACHE)

    local_path = Path(args.source).expanduser()
    if local_path.is_file():
        print(f"Transcribing local file {local_path} ...", file=sys.stderr)
        transcribe_and_print(local_path, args.model, args.lang, cache_root)
        return

    with tempfile.TemporaryDirectory() as tmp:
        print(f"Downloading {args.source} ...", file=sys.stderr)
        media_path = download_media(args.source, tmp, browser=args.browser)
        transcribe_and_print(media_path, args.model, args.lang, cache_root)

        if args.keep:
            dest = Path.cwd() / media_path.name
            media_path.replace(dest)
            print(f"\nSaved media to {dest}", file=sys.stderr)


if __name__ == "__main__":
    main()
