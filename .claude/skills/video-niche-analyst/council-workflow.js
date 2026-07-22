export const meta = {
  name: 'video-niche-analyst-council',
  description: 'Run the 8-persona expert council over a batch of short-form videos, dedup-file findings into the vault by category (one writer per category file to avoid races), then run one whole-sprint Adaptive & Learning audit.',
  phases: [
    { title: 'Council', detail: '8 personas review each video in parallel' },
    { title: 'File', detail: 'findings grouped by category; one agent per category writes that category file exactly once' },
    { title: 'Log', detail: 'all filed/rejected lines and content-angle notes appended to the video log in a single write' },
    { title: 'Audit', detail: 'Adaptive & Learning reviews the whole sprint once' },
  ],
}

const TECHNIQUE_PERSONAS = [
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
    prompt: (v) => `You are an automation engineer. Video: ${v.sourceLabel}\n\nTranscript:\n${v.transcript}\n\nFrames are at ${v.framesDir}.\n\nAnswer: which specific technique observed in this video (editing, color, captions, thumbnail) could be templated or scripted, and how concretely (name a tool/approach, e.g. an ffmpeg LUT, a caption-style preset)? Only list things with a genuine automation angle, not generic ideas. If you propose something for the Automation Backlog category, phrase "technique" as the name of the automation idea itself (e.g. "ffmpeg LUT for consistent color grade"), not the on-camera technique it automates. Concrete findings only.`,
  },
]

const CONTENT_PERSONA = {
  key: 'content',
  prompt: (v) => `You are a short-form content strategist. Video: ${v.sourceLabel}\n\nTranscript:\n${v.transcript}\n\nFrames are at ${v.framesDir} — view them if useful.\n\nAnswer in 1-3 sentences: what is the single core idea/angle of this video? Does it fit an existing content pillar (barbering, investing, or AI-automation) or reveal a new content-idea angle worth banking? This is a freeform note, not a technique to catalog — it will be logged in the sprint's Video Log, not filed into a Content Framework category.`,
}

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

const CONTENT_NOTE_SCHEMA = {
  type: 'object',
  properties: { note: { type: 'string' } },
  required: ['note'],
}

const CATEGORY_FILE_VERDICTS_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          technique: { type: 'string' },
          action: { type: 'string', enum: ['merged', 'updated', 'added', 'rejected'] },
          reason: { type: 'string' },
        },
        required: ['technique', 'action', 'reason'],
      },
    },
  },
  required: ['verdicts'],
}

const AUTOMATION_BACKLOG_SCHEMA_NOTE = 'Automation Backlog.md uses a DIFFERENT entry schema than the other 8 category files: "### <name>" then "- Status: idea | prototyped | built", "- First seen: <niche> · <date> · [[Video Log/<sprint file>]]", "- What it automates: <the manual step this replaces>", "- Approach: <concrete tool/technique>". Do NOT use Status: observed/tested or the Description/When to use/Automation potential fields for this file — those belong to the other 8 category files only.'
const STANDARD_SCHEMA_NOTE = 'Use this schema for a new entry: "### <name>" then "- Status: observed", "- First seen: <niche> · <date> · [[Video Log/<sprint file>]]", "- Frequency seen: 1", "- Description: <what it is>", "- When to use: <context>", "- Automation potential: <none | scriptable (idea) | templated (idea)>".'

// Council: for each video, 7 technique personas + 1 content-note persona run in
// parallel. Pipeline (not a barrier) so one video's results are ready for
// filing while other videos are still being reviewed.
const perVideoResults = await pipeline(
  args.videos,
  (video) => parallel([
    ...TECHNIQUE_PERSONAS.map((p) => () =>
      agent(p.prompt(video), { label: `${p.key}:${video.sourceLabel}`, phase: 'Council', schema: FINDING_SCHEMA })
        .then((r) => (r ? r.findings.map((f) => ({ ...f, persona: p.key, video: video.sourceLabel })) : []))
    ),
    () => agent(CONTENT_PERSONA.prompt(video), { label: `content:${video.sourceLabel}`, phase: 'Council', schema: CONTENT_NOTE_SCHEMA })
      .then((r) => ({ video: video.sourceLabel, note: r ? r.note : null })),
  ]).then((results) => ({
    findings: results.slice(0, -1).flat(),
    contentNote: results[results.length - 1],
  }))
)

const allFindings = perVideoResults.flatMap((r) => r.findings)
const contentNotes = perVideoResults.map((r) => r.contentNote).filter((n) => n && n.note)
log(`${allFindings.length} candidate findings and ${contentNotes.length} content-angle notes from ${args.videos.length} videos`)

// File: group findings by category so exactly ONE agent writes each category
// file this sprint (parallel ACROSS categories is safe — different files —
// but never two writers to the same file, which is what caused the race).
phase('File')
const findingsByCategory = {}
for (const f of allFindings) {
  if (!findingsByCategory[f.category]) findingsByCategory[f.category] = []
  findingsByCategory[f.category].push(f)
}

const categoryResults = await parallel(
  Object.entries(findingsByCategory).map(([category, findings]) => () => {
    const schemaNote = category === 'Automation Backlog' ? AUTOMATION_BACKLOG_SCHEMA_NOTE : STANDARD_SCHEMA_NOTE
    const findingsText = findings.map((f, i) =>
      `${i + 1}. From ${f.video} (${f.persona} persona): "${f.technique}" — ${f.description}` +
      (f.when_to_use ? ` When to use: ${f.when_to_use}.` : '') +
      (f.automation_potential ? ` Automation potential: ${f.automation_potential}.` : '')
    ).join('\n')
    return agent(
      `Vault path: ${args.vaultPath}. Read "Content Framework/${category}.md".\n\n` +
      `Here are ${findings.length} candidate finding(s) surfaced this sprint for THIS file only:\n${findingsText}\n\n` +
      `For EACH candidate, decide one of: merged (already covered by an existing entry — bump Frequency seen / add this source, don't duplicate), updated (a clearly better/more specific example of an existing entry — update its Description in place), added (genuinely new and non-generic — append a new entry), rejected (generic or low-value — write nothing for this one).\n\n` +
      `${schemaNote}\n\n` +
      `You are the only writer touching "Content Framework/${category}.md" this sprint — make ALL your edits to the file in this single pass rather than one call at a time.\n\n` +
      `Report one verdict per candidate as {technique, action, reason} — echo back each candidate's exact "technique" string verbatim so verdicts can be matched by name, not by position in the list.`,
      { label: `file:${category}`, phase: 'File', schema: CATEGORY_FILE_VERDICTS_SCHEMA }
    ).then((r) => {
      // Match by technique name, not array position — a filing agent that
      // returns a short or reordered verdicts array (schema allows it even
      // though the prompt asks for one-per-candidate) would otherwise pair
      // the wrong verdict with the wrong finding.
      const verdictsByTechnique = new Map((r && r.verdicts ? r.verdicts : []).map((v) => [v.technique, v]))
      return {
        category,
        filed: findings.map((f) => ({
          ...f,
          verdict: verdictsByTechnique.get(f.technique) || { action: 'unknown', reason: 'filing agent returned no matching verdict for this candidate' },
        })),
      }
    })
  })
)

const filed = categoryResults.flatMap((r) => r.filed)
log(`${filed.length} findings filed/rejected across ${args.videos.length} videos, ${categoryResults.length} categories touched`)

// Log: a single agent appends everything to the video log, so there is only
// ever one writer touching that shared file this sprint.
phase('Log')
const logLines = filed.map((f) => `- ${f.technique} (${f.category}): ${f.verdict.action} — ${f.verdict.reason}`)
const contentNoteLines = contentNotes.map((n) => `- ${n.video}: ${n.note}`)
await agent(
  `Append the following lines to the "## Filed / Rejected" section of ${args.videoLogPath} (do not overwrite anything already there — add these as new lines):\n${logLines.join('\n') || '(no findings this sprint)'}\n\n` +
  (contentNoteLines.length
    ? `Also add a new "## Content Angle Notes" section at the end of ${args.videoLogPath} (create the heading if it doesn't exist yet) with these freeform notes from the Content Creation persona — these are about whether each video fits an existing content pillar or suggests a new one, not techniques to file:\n${contentNoteLines.join('\n')}\n\n`
    : '') +
  `You are the only agent writing to this file this sprint — make all of these appends in one pass.`,
  { label: 'video-log-append', phase: 'Log' }
)

phase('Audit')
const filedSummary = filed.map((f) => ({ technique: f.technique, category: f.category, action: f.verdict.action }))
const audit = await agent(
  `Vault path: ${args.vaultPath}. This sprint just filed: ${JSON.stringify(filedSummary)}.\n\n` +
  `Read the affected "Content Framework/*.md" category files and the sprint's video log at ${args.videoLogPath}.\n\n` +
  `Flag: stale or redundant entries, categories that need restructuring, and whether the council personas' questions need updating based on what's been filed across sprints so far.\n\n` +
  `Write your findings directly into the "## Adaptive & Learning notes" section at the bottom of ${args.videoLogPath} (append, don't overwrite anything above it).`,
  { label: 'adaptive-learning', phase: 'Audit' }
)

return { filed, contentNotes, audit }
