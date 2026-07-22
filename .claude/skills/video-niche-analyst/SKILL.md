---
name: video-niche-analyst
description: 'Run a batch of same-niche short-form videos through a 9-persona expert council (content, editing, brand, storytelling, thumbnail, script, platform, automation, adaptive-learning), file deduped findings into the Content Framework vault. Invoke with /video-niche-analyst.'
disable-model-invocation: true
---

# Video Niche Analyst

Analyzes a batch of short-form videos from the same niche and grows a permanent, organized knowledge base of editing/hook/storytelling/thumbnail technique in the Tools vault at `/Users/r/Documents/Tools:skills/Tools/Content Framework/`.

This is a periodic **research sprint** tool — run it on a handful of videos at a time (e.g. weekly), not on every video scrolled past. See `Content Framework/README.md` in the vault for the entry schema and filing rules this skill writes to.

## When invoked

1. **Ask for the batch**, if not already given: niche name, and 2 or more video sources (URLs and/or local file paths — e.g. screen-recorded Instagram clips). Also ask: "Any underperforming examples in this niche worth including for contrast?" — a batch built only from standout videos skews toward "what winners do" with no signal on what losers do differently. If given exactly 1 video, or if the Workflow tool can't be invoked for this run, run single-pass instead — one Claude reasoning through all 9 personas' questions itself in one message — and say explicitly in the output "single-pass mode — lower rigor than full council" rather than silently downgrading without saying so.

2. **Set up the sprint's Video Log file.** Pick today's date and a niche slug, e.g. `2026-07-22-barbering-sprint`. Read `Content Framework/Video Log/README.md` in the vault for the template, then write `Content Framework/Video Log/2026-07-22-barbering-sprint.md` with the frontmatter and "Videos Watched" section filled in, and empty "## Filed / Rejected" / "## Adaptive & Learning notes" headers ready for the workflow to append under.

3. **For each video source**, run the transcriber with frame extraction, capturing stdout as the transcript:

   ```bash
   cd "/Users/r/Documents/content generation/transcribe-url"
   ./transcribe.sh "<source>" --frames "/tmp/video-niche-analyst/<slug>/<video-id>" --model base
   ```

   If `transcribe.sh` fails for a given source (bad URL, unsupported platform, network error), skip that video, note in the Video Log's "Videos Watched" section that it was skipped and why, and continue with the remaining videos rather than aborting the whole sprint.

   The transcript is printed to stdout starting at the `## Transcript` heading; the `Downloading ...` / `Transcribing with Whisper ...` progress lines are printed to stderr — when capturing output via the Bash tool, use only the stdout content (from `## Transcript` onward) as the `transcript` field, not any merged stderr progress text.

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

5. **When the workflow finishes**, report a short summary to the user: how many findings were filed vs. rejected, any content-angle notes (which videos suggested a new content-pillar angle worth banking, if any), and the Adaptive & Learning audit's headline points (it's already been written into the Video Log file — don't repeat it in full, just the gist). If the Adaptive & Learning audit didn't complete (e.g. the workflow result's `audit` field is empty/missing), tell the user the audit couldn't be completed this sprint rather than fabricating a summary of it.

## Notes for whoever invokes this

- The 9th persona, Adaptive & Learning, does **not** run per-video — it runs exactly once per sprint, after all videos and all findings are filed, auditing the whole batch plus the affected category files.
- If a candidate finding's category doesn't have a file yet in `Content Framework/` (shouldn't happen after Task 5's bootstrap, but if a category is ever added later), the filing agent should create it with the same minimal header style as the existing category files before appending a section.
- Frame extraction degrades gracefully — if `--frames` fails for a video, `transcribe.sh` still prints the transcript; pass `framesDir: null` and `thumbnailPath: null` for that video and let the visual-dependent personas note that visual analysis wasn't available, rather than guessing.
