# Hosted transcript fixture

`autopilot-hosted-transcripts.json` was generated through the real Corpus
`dispatch`/`runFormationRequirements`, `law.search`, `buildCoverageTranscript`, and
`formation.handoff` formatters using fictional mocked data, without network calls.
The source is Corpus base `bf1ed5de` plus the registered-agent quote correction
("included in the Corpus bundle; state requirements vary"). Corpus's `mcp.test.ts`
pins these exact transcripts and requires regeneration when their format changes.
Keep this copy synchronized with `apps/web/src/__tests__/fixtures/autopilot-hosted-transcripts.json`
in Corpus; do not replace it with hand-written approximations.
