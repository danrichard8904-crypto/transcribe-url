# Video Niche Analyst Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add frame extraction to `transcribe_url.py`, then a Claude Code skill (`.claude/skills/video-niche-analyst/`) that runs a 9-persona expert council over a batch of short-form videos and files deduped, non-generic findings into a new `Content Framework/` knowledge base in the Tools vault.

**Architecture:** `transcribe_url.py` gains a `--frames <dir>` flag (dense sampling of the hook window + sparse sampling after, plus a real-thumbnail fallback via yt-dlp). The new skill's `SKILL.md` walks a human/Claude through running that flag per video, building a video-log sprint file in the vault, and invoking the Workflow tool with `council-workflow.js` — which fans 8 personas out per video in parallel, files results through a per-finding dedup-against-vault agent, then runs one whole-sprint "Adaptive & Learning" audit.

**Tech Stack:** Existing `yt-dlp` + `openai-whisper` + `ffmpeg`/`ffprobe`, `pytest` (new dev dependency) for the frame-extraction code, Claude Code's Workflow tool for the council, plain markdown files in the existing (non-git) Obsidian vault at `/Users/r/Documents/Tools:skills/Tools/`.

---

## Task 1: Add pytest as a dev dependency and a tests/ smoke test

**Files:**
- Create: `content generation/transcribe-url/requirements-dev.txt`
- Create: `content generation/transcribe-url/tests/__init__.py`
- Create: `content generation/transcribe-url/tests/test_smoke.py`

- [ ] **Step 1: Create the dev requirements file**

```
pytest==9.1.1
```
Write this to `content generation/transcribe-url/requirements-dev.txt`.

- [ ] **Step 2: Install it**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && .venv/bin/pip install -r requirements-dev.txt`
Expected: `Successfully installed pytest-9.1.1 ...` (plus its dependencies)

- [ ] **Step 3: Create an empty test package marker**

Write an empty file to `content generation/transcribe-url/tests/__init__.py` (zero bytes).

- [ ] **Step 4: Write a smoke test**

```python
def test_pytest_runs():
    assert 1 + 1 == 2
```
Write this to `content generation/transcribe-url/tests/test_smoke.py`.

- [ ] **Step 5: Run it**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && .venv/bin/python -m pytest tests/ -v`
Expected: `tests/test_smoke.py::test_pytest_runs PASSED`

- [ ] **Step 6: Commit**

```bash
cd "/Users/r/Documents/content generation/transcribe-url"
git add requirements-dev.txt tests/__init__.py tests/test_smoke.py
git commit -m "test: add pytest dev dependency and smoke test"
```

---

## Task 2: `compute_frame_timestamps` — pure function for sampling schedule

Dense sampling (every 0.5s) for the first 3 seconds — the hook window — then 1 frame every 2 seconds after, clipped to the clip's actual duration.

**Files:**
- Modify: `content generation/transcribe-url/transcribe_url.py`
- Test: `content generation/transcribe-url/tests/test_frames.py`

- [ ] **Step 1: Write the failing tests**

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from transcribe_url import compute_frame_timestamps


def test_five_second_video_gets_dense_then_sparse_timestamps():
    result = compute_frame_timestamps(5.0)
    assert result == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]


def test_short_video_only_gets_dense_timestamps_up_to_its_duration():
    result = compute_frame_timestamps(2.0)
    assert result == [0.0, 0.5, 1.0, 1.5]


def test_very_short_video_still_gets_one_timestamp():
    result = compute_frame_timestamps(0.3)
    assert result == [0.0]
```
Write this to `content generation/transcribe-url/tests/test_frames.py`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && .venv/bin/python -m pytest tests/test_frames.py -v`
Expected: FAIL — `ImportError: cannot import name 'compute_frame_timestamps' from 'transcribe_url'`

- [ ] **Step 3: Implement it**

In `transcribe_url.py`, add this function after `format_ts` (i.e. after line 22, before `def download_media`):

```python
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && .venv/bin/python -m pytest tests/test_frames.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
cd "/Users/r/Documents/content generation/transcribe-url"
git add transcribe_url.py tests/test_frames.py
git commit -m "feat: add compute_frame_timestamps sampling schedule"
```

---

## Task 3: `extract_frames` — real frame extraction via ffmpeg

Uses a synthetically-generated test video (via ffmpeg's `lavfi testsrc`) so the test needs no network access and no real downloaded media.

**Files:**
- Modify: `content generation/transcribe-url/transcribe_url.py`
- Test: `content generation/transcribe-url/tests/test_frames.py`

- [ ] **Step 1: Write the failing test**

Append this to `content generation/transcribe-url/tests/test_frames.py`:

```python
import subprocess

from transcribe_url import extract_frames


def test_extract_frames_creates_expected_frame_count(tmp_path):
    video_path = tmp_path / "sample.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", "testsrc=duration=5:size=320x240:rate=10",
            "-pix_fmt", "yuv420p", str(video_path),
        ],
        capture_output=True, check=True,
    )
    out_dir = tmp_path / "frames"

    frame_paths = extract_frames(video_path, out_dir)

    assert len(frame_paths) == 7
    for frame_path in frame_paths:
        assert frame_path.is_file()
        assert frame_path.stat().st_size > 0
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && .venv/bin/python -m pytest tests/test_frames.py -v`
Expected: FAIL — `ImportError: cannot import name 'extract_frames' from 'transcribe_url'`

- [ ] **Step 3: Implement it**

Add `import subprocess` to the top imports of `transcribe_url.py` (after `import sys` on line 10). Then add these two functions after `compute_frame_timestamps` and before `def download_media`:

```python
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && .venv/bin/python -m pytest tests/test_frames.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
cd "/Users/r/Documents/content generation/transcribe-url"
git add transcribe_url.py tests/test_frames.py
git commit -m "feat: add extract_frames with real-thumbnail overlay"
```

---

## Task 4: Thumbnail-fallback detection, `--frames` CLI flag, graceful degrade, README

**Files:**
- Modify: `content generation/transcribe-url/transcribe_url.py`
- Modify: `content generation/transcribe-url/README.md`
- Test: `content generation/transcribe-url/tests/test_frames.py`

- [ ] **Step 1: Write the failing tests**

Append this to `content generation/transcribe-url/tests/test_frames.py`:

```python
from transcribe_url import find_downloaded_thumbnail


def test_find_downloaded_thumbnail_matches_same_stem(tmp_path):
    media_path = tmp_path / "abc123.mp4"
    media_path.write_bytes(b"fake video")
    thumb_path = tmp_path / "abc123.webp"
    thumb_path.write_bytes(b"fake thumb")

    result = find_downloaded_thumbnail(media_path)

    assert result == thumb_path


def test_find_downloaded_thumbnail_returns_none_when_absent(tmp_path):
    media_path = tmp_path / "xyz789.mp4"
    media_path.write_bytes(b"fake video")

    result = find_downloaded_thumbnail(media_path)

    assert result is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && .venv/bin/python -m pytest tests/test_frames.py -v`
Expected: FAIL — `ImportError: cannot import name 'find_downloaded_thumbnail' from 'transcribe_url'`

- [ ] **Step 3: Implement `find_downloaded_thumbnail`**

Add this function after `extract_frames` and before `def download_media`:

```python
def find_downloaded_thumbnail(media_path):
    media_path = Path(media_path)
    for candidate in media_path.parent.glob(f"{media_path.stem}.*"):
        if candidate != media_path and candidate.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            return candidate
    return None
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && .venv/bin/python -m pytest tests/test_frames.py -v`
Expected: 6 passed

- [ ] **Step 5: Wire `want_thumbnail` into `download_media`**

Replace the existing `download_media` function (currently lines 25-41) with:

```python
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
```

- [ ] **Step 6: Wire the `--frames` flag into `main()`**

Replace the whole `main()` function (currently lines 57-86) with:

```python
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
            except subprocess.CalledProcessError as e:
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
            except subprocess.CalledProcessError as e:
                print(f"Frame extraction failed: {e} — continuing with audio-only transcription", file=sys.stderr)
        transcribe_and_print(media_path, args.model, args.lang, cache_root)

        if args.keep:
            dest = Path.cwd() / media_path.name
            media_path.replace(dest)
            print(f"\nSaved media to {dest}", file=sys.stderr)


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Run the full test suite**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && .venv/bin/python -m pytest tests/ -v`
Expected: 7 passed

- [ ] **Step 8: Manually verify against a real video**

Run: `cd "/Users/r/Documents/content generation/transcribe-url" && ./transcribe.sh "<a real YouTube URL>" --frames /tmp/niche-test-frames --model tiny`
Expected: stderr shows `Downloading ...` then transcript prints to stdout; `ls /tmp/niche-test-frames` shows `frame_000_0.0s.jpg` through `frame_006_3.0s.jpg` plus (on YouTube) a `thumbnail_real.*` file.

- [ ] **Step 9: Update the README**

Read `content generation/transcribe-url/README.md` first, then add a new subsection under the existing usage section:

```markdown
### Frame extraction

Pass `--frames <dir>` to also pull sampled stills alongside the transcript — dense sampling (every 0.5s) for the first 3 seconds (the hook window), then one frame every 2 seconds after, plus the platform's real thumbnail when yt-dlp can fetch one (reliable on YouTube, best-effort on TikTok/Instagram). If frame extraction fails, transcription still completes — a warning prints to stderr instead of aborting the run.

```bash
./transcribe.sh <url> --frames ./frames
```
```

- [ ] **Step 10: Commit**

```bash
cd "/Users/r/Documents/content generation/transcribe-url"
git add transcribe_url.py tests/test_frames.py README.md
git commit -m "feat: add --frames flag with real-thumbnail fallback and graceful degrade"
```

---

## Task 5: Vault bootstrap — `Content Framework/`

The vault at `/Users/r/Documents/Tools:skills/Tools/` is **not** a git repo (confirmed during design) — no git steps in this task, just file creation. None of these files are read by any existing Dataview index (all indexes are scoped `FROM "Catalog" OR "My Projects"`), so no risk of breaking `Indexes/*`.

**Files:**
- Create: `Tools/Content Framework/README.md`
- Create: `Tools/Content Framework/Hooks.md`
- Create: `Tools/Content Framework/Editing Tricks.md`
- Create: `Tools/Content Framework/Captions.md`
- Create: `Tools/Content Framework/Color Grading.md`
- Create: `Tools/Content Framework/Storytelling & Tone.md`
- Create: `Tools/Content Framework/Thumbnails.md`
- Create: `Tools/Content Framework/Script Writing.md`
- Create: `Tools/Content Framework/Brand Building.md`
- Create: `Tools/Content Framework/Automation Backlog.md`
- Create: `Tools/Content Framework/Video Log/README.md`
- Modify: `Tools/Home.md`

(`Tools/` below is shorthand for `/Users/r/Documents/Tools:skills/Tools/`.)

- [ ] **Step 1: Write `Content Framework/README.md`**

```markdown
# Content Framework

The permanent, growing knowledge base built from watching short-form videos across your niches (barbering, investing, AI/automation). Filed by the `video-niche-analyst` skill's expert council after every research sprint — not written to by hand except to correct or prune an entry.

This is deliberately separate from `Catalog/` and `My Projects/` — it's not a repo catalog, it holds editing/hook/storytelling technique, not tool writeups. None of the `Indexes/*` Dataview queries read from this folder.

## Folder structure

```
Content Framework/
├── README.md                 ← this file
├── Hooks.md
├── Editing Tricks.md
├── Captions.md
├── Color Grading.md
├── Storytelling & Tone.md
├── Thumbnails.md
├── Script Writing.md
├── Brand Building.md
├── Automation Backlog.md
└── Video Log/
    ├── README.md              ← sprint file naming + template
    └── YYYY-MM-DD-<niche>-sprint.md   ← one per research sprint
```

## Entry schema (every technique in every category file)

Each category file accumulates techniques as `###` sections — one file per category, not one file per tip, so the vault doesn't sprawl:

```markdown
### <Technique name>
- Status: observed | tested
- First seen: <niche> · <date> · [[Video Log/YYYY-MM-DD-<niche>-sprint]]
- Frequency seen: <N videos>
- Description: <what it is>
- When to use: <context>
- Automation potential: none | scriptable (<idea>) | templated (<idea>)
```

`Status: observed` means it was seen in someone else's video and never tried. `Status: tested` means you actually used it and it's confirmed to work for you — nothing should be silently upgraded from `observed` to `tested`; that only happens by hand, after you've actually posted with it.

## Filing rules

For every candidate technique the council surfaces:
1. Already covered by an existing entry → bump `Frequency seen`, add this sprint's source to it. Don't duplicate.
2. A clearly better/more specific example of an existing entry → update that entry's `Description` in place.
3. Genuinely new and non-generic → add a new `###` section using the schema above.
4. Generic or low-value (e.g. "use good lighting") → reject. Note the rejection in the sprint's Video Log, don't add it here.

## Cadence

This is a periodic **research sprint** tool (e.g. weekly, a handful of videos per niche) — not something run on every video scrolled past. Running the full council on every video would compete directly with actual time spent creating content.
```

- [ ] **Step 2: Write the 8 category files**

Each of these gets the same minimal opening — write all 8:

`Content Framework/Hooks.md`:
```markdown
# Hooks

Audio and visual hook techniques (openers, pattern interrupts, cold-opens) observed across analyzed videos. See [[Content Framework/README]] for the entry schema and filing rules.
```

`Content Framework/Editing Tricks.md`:
```markdown
# Editing Tricks

Cut rhythm, transitions, on-screen text animation, and other splice/edit techniques observed across analyzed videos. See [[Content Framework/README]] for the entry schema and filing rules.
```

`Content Framework/Captions.md`:
```markdown
# Captions

Caption pacing, placement, and font/style choices observed across analyzed videos. See [[Content Framework/README]] for the entry schema and filing rules.
```

`Content Framework/Color Grading.md`:
```markdown
# Color Grading

Color grade and look treatments observed across analyzed videos. See [[Content Framework/README]] for the entry schema and filing rules.
```

`Content Framework/Storytelling & Tone.md`:
```markdown
# Storytelling & Tone

Narrative structures, pacing of the "turn," and tone/energy choices observed across analyzed videos. See [[Content Framework/README]] for the entry schema and filing rules.
```

`Content Framework/Thumbnails.md`:
```markdown
# Thumbnails

Cover-frame and thumbnail design choices observed across analyzed videos. See [[Content Framework/README]] for the entry schema and filing rules.
```

`Content Framework/Script Writing.md`:
```markdown
# Script Writing

Hook-line wording, sentence rhythm, pattern interrupts, and CTA phrasing observed across analyzed videos. See [[Content Framework/README]] for the entry schema and filing rules.
```

`Content Framework/Brand Building.md`:
```markdown
# Brand Building

Recognizable-persona techniques (recurring motifs, catchphrases, personal disclosure) observed across analyzed videos. See [[Content Framework/README]] for the entry schema and filing rules.
```

- [ ] **Step 3: Write `Content Framework/Automation Backlog.md`**

This one uses a different schema (idea → prototyped → built, not observed → tested), since it tracks backend-automation ideas rather than on-camera technique:

```markdown
# Automation Backlog

Concrete backend-automation ideas surfaced by the Automation Engineer persona while analyzing videos — a direct feed into future tool-building or n8n workflow work.

## Entry schema

```markdown
### <Automation idea>
- Status: idea | prototyped | built
- First seen: <niche> · <date> · [[Video Log/YYYY-MM-DD-<niche>-sprint]]
- What it automates: <the manual step this replaces>
- Approach: <concrete tool/technique, e.g. an ffmpeg LUT, a caption-style preset>
```
```

- [ ] **Step 4: Write `Content Framework/Video Log/README.md`**

```markdown
# Video Log

One file per research sprint, named `YYYY-MM-DD-<niche>-sprint.md`. This is the audit trail — what was watched and what happened to each finding. The category files one level up are the distilled, permanent framework; this folder is the raw history behind them.

## Sprint file template

```markdown
---
niche: <niche>
date: YYYY-MM-DD
videos:
  - <source-label-1>
  - <source-label-2>
---

# <Niche> Sprint — <date>

## Videos Watched
- <source-label-1>
- <source-label-2>

## Filed / Rejected
<!-- appended by the council's File phase, one line per finding -->

## Adaptive & Learning notes
<!-- appended once per sprint by the Adaptive & Learning audit -->
```
```

- [ ] **Step 5: Add a link from `Home.md`**

Read `Tools/Home.md` first, then add `- [[Content Framework]] — editing/hook/storytelling technique, distilled from watching short-form video` as a new bullet in the top list, right after the existing `- [[Catalog]] — things I found and curated in` line.

- [ ] **Step 6: Verify**

Run: `ls "/Users/r/Documents/Tools:skills/Tools/Content Framework/" "/Users/r/Documents/Tools:skills/Tools/Content Framework/Video Log/"`
Expected: the 10 files/folders listed above, all present.

(No git commit — this vault has no `.git`.)

---

## Task 6: The skill — `SKILL.md` + `council-workflow.js`

**Files:**
- Create: `content generation/transcribe-url/.claude/skills/video-niche-analyst/SKILL.md`
- Create: `content generation/transcribe-url/.claude/skills/video-niche-analyst/council-workflow.js`

- [ ] **Step 1: Write `council-workflow.js`**

```javascript
export const meta = {
  name: 'video-niche-analyst-council',
  description: 'Run the 8-persona expert council over a batch of short-form videos, dedup-file findings into the vault, then run one whole-sprint Adaptive & Learning audit.',
  phases: [
    { title: 'Council', detail: '8 personas review each video in parallel' },
    { title: 'File', detail: 'each finding is deduped against the vault and filed or rejected' },
    { title: 'Audit', detail: 'Adaptive & Learning reviews the whole sprint once' },
  ],
}

const PERSONAS = [
  {
    key: 'content',
    prompt: (v) => `You are a short-form content strategist. Video: ${v.sourceLabel}\n\nTranscript:\n${v.transcript}\n\nFrames are at ${v.framesDir} — view them if useful.\n\nAnswer: what is the single core idea/angle of this video? Does it fit an existing content pillar (barbering, investing, or AI-automation) or reveal a new content-idea angle worth banking? Concrete findings only, no generic advice.`,
  },
  {
    key: 'editing',
    prompt: (v) => `You are a video editor reviewing cut technique. Video: ${v.sourceLabel}\n\nTranscript:\n${v.transcript}\n\nFrames are at ${v.framesDir} — view them.\n\nAnswer: what is the cut frequency/rhythm (does pace change at specific moments)? What transition types are used? What is the on-screen text animation style? Concrete findings only.`,
  },
  {
    key: 'brand',
    prompt: (v) => `You are a personal-brand consultant. Video: ${v.sourceLabel}\n\nTranscript:\n${v.transcript}\n\nFrames are at ${v.framesDir}.\n\nAnswer: how does the creator establish a recognizable persona across this video (recurring visual motif, catchphrase, personal disclosure)? Is it replicable without being a direct copy? Concrete findings only.`,
  },
  {
    key: 'storytelling',
    prompt: (v) => `You are a story editor. Video: ${v.sourceLabel}\n\nTranscript:\n${v.transcript}\n\nAnswer: what narrative structure does this video use (problem-struggle-payoff, listicle, before/after, myth-bust, other)? Where does the turn/twist land? Describe the tone and energy. Concrete findings only.`,
  },
  {
    key: 'thumbnail',
    prompt: (v) => `You are a thumbnail/cover-image designer. Video: ${v.sourceLabel}\n\nFrames are at ${v.framesDir}${v.thumbnailPath ? `, including a real platform thumbnail at ${v.thumbnailPath}` : ' (no real platform thumbnail was available, only extracted stills)'}.\n\nAnswer: what does the actual or likely cover frame look like — text overlay, contrast/color pop, face-forward vs. object-forward? Concrete findings only.`,
  },
  {
    key: 'script',
    prompt: (v) => `You are a scriptwriter for short-form video. Video: ${v.sourceLabel}\n\nTranscript:\n${v.transcript}\n\nAnswer: what is the exact hook line wording (first 1-3 spoken sentences, quote it verbatim)? Describe the sentence rhythm and any pattern interrupts. What is the CTA phrasing and where does it land? Concrete findings only.`,
  },
  {
    key: 'platform',
    prompt: (v) => `You are a platform/algorithm strategist for short-form video. Video: ${v.sourceLabel}\n\nTranscript:\n${v.transcript}\n\nFrames are at ${v.framesDir}.\n\nAnswer: is the pacing tuned for a specific platform (TikTok-fast vs. Reels-slower)? What retention tricks are used (loop structure, an open question held until later)? What is the video length and why might that length be chosen? Concrete findings only.`,
  },
  {
    key: 'automation',
    prompt: (v) => `You are an automation engineer. Video: ${v.sourceLabel}\n\nTranscript:\n${v.transcript}\n\nFrames are at ${v.framesDir}.\n\nAnswer: which specific technique observed in this video (editing, color, captions, thumbnail) could be templated or scripted, and how concretely (name a tool/approach, e.g. an ffmpeg LUT, a caption-style preset)? Only list things with a genuine automation angle, not generic ideas. Concrete findings only.`,
  },
]

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          technique: { type: 'string' },
          category: {
            type: 'string',
            enum: [
              'Hooks', 'Editing Tricks', 'Captions', 'Color Grading',
              'Storytelling & Tone', 'Thumbnails', 'Script Writing',
              'Brand Building', 'Automation Backlog',
            ],
          },
          description: { type: 'string' },
          when_to_use: { type: 'string' },
          automation_potential: { type: 'string' },
        },
        required: ['technique', 'category', 'description'],
      },
    },
  },
  required: ['findings'],
}

const FILE_VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['merged', 'updated', 'added', 'rejected'] },
    reason: { type: 'string' },
  },
  required: ['action', 'reason'],
}

function buildFilePrompt(finding) {
  return (
    `Vault path: ${args.vaultPath}. Video log file: ${args.videoLogPath}.\n\n` +
    `Read "Content Framework/${finding.category}.md" if it exists.\n\n` +
    `Candidate finding from ${finding.video} (${finding.persona} persona): "${finding.technique}" — ${finding.description}` +
    (finding.when_to_use ? ` When to use: ${finding.when_to_use}.` : '') +
    (finding.automation_potential ? ` Automation potential: ${finding.automation_potential}.` : '') +
    `\n\nDecide one of:\n` +
    `(a) merged — already covered by an existing entry: bump its "Frequency seen" and add this source, do not duplicate.\n` +
    `(b) updated — a clearly better/more specific example of an existing entry: update that entry's Description in place.\n` +
    `(c) added — genuinely new and non-generic: append a new "###" section using the fixed schema (Status: observed, First seen, Frequency seen: 1, Description, When to use, Automation potential).\n` +
    `(d) rejected — generic or low-value: write nothing to the category file.\n\n` +
    `Whichever you chose, also append one line to the "## Filed / Rejected" section of ${args.videoLogPath}: "- <technique> (<category>): <action> — <reason>".\n\n` +
    `Report which action you took and why.`
  )
}

// Pipeline (not parallel-then-parallel) so a video's findings start filing
// immediately while other videos are still being reviewed by the council —
// filing one finding never needs any other video's results, so a barrier
// here would only waste wall-clock.
const perVideoFiled = await pipeline(
  args.videos,
  (video) => parallel(
    PERSONAS.map((p) => () =>
      agent(p.prompt(video), { label: `${p.key}:${video.sourceLabel}`, phase: 'Council', schema: FINDING_SCHEMA })
        .then((r) => (r ? r.findings.map((f) => ({ ...f, persona: p.key, video: video.sourceLabel })) : []))
    )
  ).then((arrays) => arrays.flat()),
  (findings) => parallel(
    findings.map((finding) => () =>
      agent(buildFilePrompt(finding), { label: `file:${finding.technique}`, phase: 'File', schema: FILE_VERDICT_SCHEMA })
        .then((verdict) => ({ ...finding, verdict }))
    )
  )
)
const filed = perVideoFiled.filter(Boolean).flat().filter(Boolean)
log(`${filed.length} findings filed/rejected across ${args.videos.length} videos`)

phase('Audit')
const filedSummary = filed.map((f) => ({ technique: f.technique, category: f.category, action: f.verdict?.action }))
const audit = await agent(
  `Vault path: ${args.vaultPath}. This sprint just filed: ${JSON.stringify(filedSummary)}.\n\n` +
  `Read the affected "Content Framework/*.md" category files and the sprint's video log at ${args.videoLogPath}.\n\n` +
  `Flag: stale or redundant entries, categories that need restructuring, and whether the 8 council personas' questions need updating based on what's been filed across sprints so far.\n\n` +
  `Write your findings directly into the "## Adaptive & Learning notes" section at the bottom of ${args.videoLogPath} (append, don't overwrite anything above it).`,
  { label: 'adaptive-learning', phase: 'Audit' }
)

return { filed, audit }
```

- [ ] **Step 2: Verify the script's JS syntax**

Run: `node --check "/Users/r/Documents/content generation/transcribe-url/.claude/skills/video-niche-analyst/council-workflow.js"`
Expected: no output, exit code 0 (a syntax error would print `SyntaxError: ...` and exit non-zero)

Note: `council-workflow.js` uses top-level `await`/`phase`/`agent`/`pipeline`/`parallel`/`args`/`log`, which only exist inside the Workflow tool's execution context — `node --check` only validates JS syntax, it does not (and should not) execute the file.

- [ ] **Step 3: Write `SKILL.md`**

```markdown
---
name: video-niche-analyst
description: 'Run a batch of same-niche short-form videos through a 9-persona expert council (content, editing, brand, storytelling, thumbnail, script, platform, automation, adaptive-learning), file deduped findings into the Content Framework vault. Invoke with /video-niche-analyst.'
disable-model-invocation: true
---

# Video Niche Analyst

Analyzes a batch of short-form videos from the same niche and grows a permanent, organized knowledge base of editing/hook/storytelling/thumbnail technique in the Tools vault at `/Users/r/Documents/Tools:skills/Tools/Content Framework/`.

This is a periodic **research sprint** tool — run it on a handful of videos at a time (e.g. weekly), not on every video scrolled past. See `Content Framework/README.md` in the vault for the entry schema and filing rules this skill writes to.

## When invoked

1. **Ask for the batch**, if not already given: niche name, and 2 or more video sources (URLs and/or local file paths — e.g. screen-recorded Instagram clips). Also ask: "Any underperforming examples in this niche worth including for contrast?" — a batch built only from standout videos skews toward "what winners do" with no signal on what losers do differently.

2. **Set up the sprint's Video Log file.** Pick today's date and a niche slug, e.g. `2026-07-22-barbering-sprint`. Read `Content Framework/Video Log/README.md` in the vault for the template, then write `Content Framework/Video Log/2026-07-22-barbering-sprint.md` with the frontmatter and "Videos Watched" section filled in, and empty "## Filed / Rejected" / "## Adaptive & Learning notes" headers ready for the workflow to append under.

3. **For each video source**, run the transcriber with frame extraction, capturing stdout as the transcript:

   ```bash
   cd "/Users/r/Documents/content generation/transcribe-url"
   ./transcribe.sh "<source>" --frames "/tmp/video-niche-analyst/<slug>/<video-id>" --model base
   ```

   Build a `videos` array, one entry per source:
   ```json
   { "sourceLabel": "<short human label, e.g. the URL or filename>", "transcript": "<captured stdout>", "framesDir": "/tmp/video-niche-analyst/<slug>/<video-id>", "thumbnailPath": "<path to thumbnail_real.* in framesDir if it exists, else null>" }
   ```

4. **Invoke the Workflow tool** with the script at `council-workflow.js` (in this skill's directory — read it and pass its full contents as the `script` argument) and:
   ```json
   {
     "videos": [ /* the array built in step 3 */ ],
     "vaultPath": "/Users/r/Documents/Tools:skills/Tools",
     "videoLogPath": "/Users/r/Documents/Tools:skills/Tools/Content Framework/Video Log/2026-07-22-barbering-sprint.md"
   }
   ```
   This runs in the background — you'll be notified when it completes. Do not poll for it.

5. **When the workflow finishes**, report a short summary to the user: how many findings were filed vs. rejected, and the Adaptive & Learning audit's headline points (it's already been written into the Video Log file — don't repeat it in full, just the gist).

## Notes for whoever invokes this

- The 9th persona, Adaptive & Learning, does **not** run per-video — it runs exactly once per sprint, after all videos and all findings are filed, auditing the whole batch plus the affected category files.
- If a candidate finding's category doesn't have a file yet in `Content Framework/` (shouldn't happen after Task 5's bootstrap, but if a category is ever added later), the filing agent should create it with the same minimal header style as the existing category files before appending a section.
- Frame extraction degrades gracefully — if `--frames` fails for a video, `transcribe.sh` still prints the transcript; pass `framesDir: null` and `thumbnailPath: null` for that video and let the visual-dependent personas note that visual analysis wasn't available, rather than guessing.
```

- [ ] **Step 4: Verify the frontmatter parses as valid YAML**

Run:
```bash
python3 -c "
import yaml
text = open('/Users/r/Documents/content generation/transcribe-url/.claude/skills/video-niche-analyst/SKILL.md').read()
frontmatter = text.split('---')[1]
data = yaml.safe_load(frontmatter)
assert data['name'] == 'video-niche-analyst'
assert data['disable-model-invocation'] is True
print('OK', data['name'])
"
```
Expected: `OK video-niche-analyst`

(If `python3 -c "import yaml"` fails with `ModuleNotFoundError`, run `.venv/bin/pip install pyyaml` first, from `content generation/transcribe-url/`, then retry — this is a one-off verification, not a new runtime dependency, so don't add it to `requirements.txt`.)

- [ ] **Step 5: Commit**

```bash
cd "/Users/r/Documents/content generation/transcribe-url"
git add .claude/skills/video-niche-analyst/SKILL.md .claude/skills/video-niche-analyst/council-workflow.js
git commit -m "feat: add video-niche-analyst skill with 9-persona council workflow"
```

---

## Self-review notes

- **Spec coverage:** frame extraction (§1) → Tasks 2-4. Council + narrow per-persona lenses (§2) → Task 6. Vault structure + entry schema (§3) → Task 5. Dedup/filing process (§4) → `council-workflow.js`'s File phase + `Content Framework/README.md`'s filing rules. Cadence + flop-sampling ask (§5) → `SKILL.md` step 1. Error handling (§6) → Task 4 step 6 (graceful degrade) + `SKILL.md`'s closing note + Task 5 step 1 (bootstrap-if-missing note). Testing (§7) → Tasks 1-4's real pytest suite plus Task 6's manual pilot-sprint validation called out in `SKILL.md`.
- **Placeholder scan:** none found — every step has literal file contents or exact commands.
- **Type consistency:** `compute_frame_timestamps(duration, ...)` (Task 2) is called by `extract_frames(media_path, out_dir, thumbnail_path=None)` (Task 3) with just `duration` — consistent. `extract_frames` and `find_downloaded_thumbnail` (Task 4) are both called from `main()` with matching signatures. `council-workflow.js`'s `args.videos[].sourceLabel/transcript/framesDir/thumbnailPath` match exactly what `SKILL.md` step 3 instructs building.
