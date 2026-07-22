# Video Niche Analyst — Design

**Goal:** A Claude Code skill, living alongside `transcribe_url.py`, that takes a batch of short-form videos from the same niche, has a 9-persona expert council watch and judge each one, and files genuinely new, deduped techniques into a permanent, organized "Content Framework" knowledge base in the Tools vault — so editing, hooks, storytelling, and thumbnail craft compound over time instead of being re-discovered from scratch.

**Architecture:** Extend `transcribe_url.py` with frame extraction, add a new `skills/video-niche-analyst/SKILL.md` that orchestrates download → transcribe → extract frames → run the council (via the Workflow tool, true parallel subagents) → dedup against the vault → file results. Runs as a periodic batch "research sprint," not a per-video real-time habit.

**Tech Stack:** Existing `yt-dlp` + `openai-whisper` (already in `transcribe_url.py`), `ffmpeg`/`ffprobe` (already installed) for frame extraction, Claude Code's Workflow tool for the parallel council, the existing Obsidian vault at `/Users/r/Documents/Tools:skills/Tools/` for storage.

---

## 1. Frame extraction (`transcribe_url.py` addition)

New `--frames <dir>` option on the existing CLI, plus a `extract_frames(media_path, out_dir)` function:

- Dense sampling for the first 3 seconds (every 0.5s) — the hook window, where visual hooks/pattern-interrupts live.
- 1 frame every 2 seconds for the rest of the video.
- Real thumbnail fallback: before falling back to a raw extracted frame, try `yt-dlp --write-thumbnail` for the platform's actual cover image (reliable on YouTube; attempt on TikTok/Instagram, but don't fail the run if unsupported — creators often pick a custom cover frame that a naive frame-0 grab won't capture).
- Works on both freshly-downloaded media and local files (screen recordings) — reuses the same code path `main()` already uses to detect "is this a local file or a URL."

If frame extraction fails for a given video (corrupt download, unsupported container), the pipeline continues audio-only: personas that need visuals (Thumbnail Expert, Video Editing, Platform/Algorithm Strategist for pacing-on-screen) note "visual analysis unavailable" rather than guessing; personas that work from transcript alone (Script Writing, Storytelling, Content Creation) proceed normally.

## 2. The council — 9 personas, each with a narrow, specific lens

A single Claude instance role-playing 9 experts in one pass tends to produce shallow, repetitive output — the "expert" labels don't create real differences in what gets noticed. To get genuine coverage, each persona is dispatched as an **independent subagent** (via the Workflow tool — valid here because these skill instructions explicitly direct the call, which is one of the tool's own opt-in conditions) with a **specific question to answer**, not just a job title:

1. **Content Creation** — What's the single core idea/angle? Does it fit an existing niche pillar (barbering / investing / AI-automation) or reveal a new content-idea angle worth banking?
2. **Video Editing** — Cut frequency and rhythm (does pace change at specific moments?), transition types, on-screen text animation style.
3. **Brand Building** — How does the creator establish a recognizable persona across the video (recurring visual motif, catchphrase, personal disclosure) — and is it replicable without being a copy?
4. **Storytelling** — Narrative structure (problem→struggle→payoff, listicle, before/after, myth-bust), where the turn/twist lands, tone and energy.
5. **Thumbnail Expert** — Actual cover frame vs. auto-extracted frame, text overlay, contrast/color pop, face-forward vs. object-forward.
6. **Script Writing** — Exact hook line wording (first 1-3 spoken sentences), sentence rhythm, pattern interrupts, CTA phrasing/placement.
7. **Platform/Algorithm Strategist** — Pacing relative to platform norms (TikTok-fast vs. Reels-slower), retention tricks (loop structure, open question held until later), video length choice.
8. **Automation Engineer** — Which observed technique could be templated or scripted (LUT for a color grade, a caption-style preset, a thumbnail template)? Feeds `Automation Backlog.md` directly.
9. **Adaptive & Learning** — **Not per-video.** Runs exactly once per sprint (after all videos in that sprint are processed), reads the sprint's Video Log plus the relevant category notes, and flags: stale/redundant entries, categories that need restructuring, whether council questions 1-8 need updating based on what's been filed so far.

Fallback: the full 9-persona parallel council is the default whenever a sprint has 2+ videos. For a true ad-hoc single-video request outside a sprint, the skill may run single-pass instead — but the output must say so explicitly ("single-pass mode — lower rigor than full council") rather than silently downgrading.

## 3. Vault structure — `Content Framework/` (new top-level section, parallel to `Catalog/`)

```
Content Framework/
  Hooks.md
  Editing Tricks.md
  Captions.md
  Color Grading.md
  Storytelling & Tone.md
  Thumbnails.md
  Script Writing.md
  Brand Building.md
  Automation Backlog.md
  Video Log/
    2026-07-22-barbering-sprint.md
    2026-07-29-investing-sprint.md
    ...
```

**Category notes** (`Hooks.md`, etc.) accumulate techniques as sections, not as one file per tip — keeps file count bounded. Each technique gets a fixed micro-schema:

```markdown
### <Technique name>
- Status: observed | tested
- First seen: <niche> · <date> · [[Video Log/2026-07-22-barbering-sprint]]
- Frequency seen: <N videos>
- Description: <what it is>
- When to use: <context>
- Automation potential: none | scriptable (<idea>) | templated (<idea>)
```

`Status` distinguishes "seen in someone else's video" from "you actually tried this and it worked" — nothing is allowed to silently read as validated advice until you've posted with it and updated the status yourself.

**Video Log** — one file per sprint (not per video), listing every video watched that sprint, per-persona findings, and what got filed vs. rejected (with why). This is the audit trail; category notes are the distilled, permanent framework.

**Automation Backlog.md** — running list of automation ideas surfaced by the Automation Engineer persona, same status-style schema (`idea` → `prototyped` → `built`), a direct feed into future n8n/tool-building work.

## 4. Dedup / filing process

For each candidate tip a persona surfaces:
1. Read the relevant category note first.
2. If an existing entry already covers it → don't add a new section; instead bump "Frequency seen" and add this sprint's video to its source list.
3. If it's a clearly better/more specific example of an existing entry → update that entry's description rather than duplicating.
4. If genuinely new and non-generic → add a new section using the schema above.
5. If generic/low-value (e.g., "use good lighting") → discard; note as rejected in the Video Log, don't pollute the category note.

Dedup is a judgment call made by whichever persona surfaced the tip, not exact string matching — flagged here as an accepted limitation (near-duplicates phrased differently may occasionally slip through; the periodic Adaptive & Learning pass is the backstop that catches this over time).

## 5. Cadence

Designed as a periodic **research sprint** (e.g., weekly, a handful of videos per niche), not a per-video real-time habit — running the full council on every video scrolled past would compete directly with the 2-3hr/day actually available for creating content. The skill, when invoked, should also ask whether any underperforming ("flop") examples are available for contrast in that niche, since a batch built only from videos that stood out to the user skews survivorship-biased toward "what winners do" with no signal on what losers do differently.

## 6. Error handling

- Frame extraction fails → continue audio-only for that video, degrade gracefully per persona (see §1).
- Local file input (screen recording) → skip download, frame-extract directly from the local path.
- Category note doesn't exist yet (first run) → bootstrap it with a minimal header, no placeholder content.
- Workflow tool not invoked/available for a given run → single-pass fallback, explicitly labeled as lower rigor (see §2).

## 7. Testing

- `extract_frames()` and the thumbnail-fallback logic are ordinary Python — verify with a real TikTok and a real YouTube URL (matches how `transcribe_url.py`'s existing download/format-selection logic was verified), confirming expected frame counts/naming and that the real thumbnail is preferred over a raw frame grab when available.
- The council/vault-filing logic is instruction content (SKILL.md + Workflow script), not unit-testable in the traditional sense — validated via a real pilot sprint: one niche, 5 videos, checked by hand that category notes end up with sane, non-duplicated, appropriately-scoped entries before treating the schema as locked.
