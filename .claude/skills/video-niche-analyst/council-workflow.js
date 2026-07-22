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
