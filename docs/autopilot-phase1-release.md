# Phase 1 sourced planning backend

The FC API adds `POST /api/plan` (`PlanInput` → `PlanResponse`) and
`POST /api/plan/handoff` (`PlanInput` → `PlanHandoff`). Wire types are mirrored
in `autopilot/src/plan-contract.ts`. `/api/chat` remains available.

Deploy FC before the web frontend, under separate deployment authorization.
An older FC returns 404: the frontend must preserve input and show its unavailable
fallback, never render legacy generated legal prose as a sourced plan.

Plans use the hosted requirements catalog and request-local law evidence.
Evidence binding establishes provenance, not applicability or completeness.
Unknown requirements remain Needs checking. No purchase or filing happens here.

The plan accepts only the seven `PlanInput` fields, bare US state/DC codes or
null, and `llc`/`nonprofit`/null. All items remain `needsCheck: true`: there is no
applicability checker. Catalog items identify the selected formation state;
tax searches use the operating state. Exact, unambiguous searchable municipal
coverage is required before a local search. The inspected app's stable law URL
is `/code/<UUID>`; there is no `/law/<UUID>` route. Text-format drift fails closed.

Pricing requires one valid current `PRICE (live)` line from the selected
formation catalog. Complete price/offer qualifiers are preserved; unavailable
prices and offers are withheld. `checkedAt` is a quote timestamp, not a reservation;
the web frontend must mark saved quotes stale and refresh before review.

The handoff accepts ready mode with explicit state/entity, calls the hosted
`formation.handoff` only, and returns its missing fields. It appends sanitized
campaign query parameters before the fragment, preserving hosted `src`/`ref`
bytes. Only the exact HTTPS `corpuslaw.us/formation` destination is accepted.
There is no local prefill fallback. Normal hosted regulatory-note behavior may
occur; this backend starts no additional jobs, checkout or filing.

Limits: 16 KiB plan request body, 5s body deadline, 24s planner deadline (25s HTTP
handler backstop), at most six hosted tool calls, three searches of two hits each,
4.5s per tool, 128 KiB per tool response, up to twelve plan items, at most eighteen source
records, ten pricing lines/16 KiB, and 96 KiB serialized HTTP response. Optional
Qwen ordering uses the existing fast lane, a 2s timeout, no retries and 256 output
tokens. Model IDs are intersected with candidates; all candidates remain present.
Failures retain deterministic items. Total planner timeout returns generic 504.
Disconnects cancel downstream requests. No diagnostics or plan text are logged.
The existing process-local hourly request counter is shared with `/api/chat`;
it is not a global dollar cap and its configuration is unchanged. Legacy chat
keeps its behavior, with a new 64 KiB/5s body-buffer safety limit.

Validation (2026-10-25), from
`/Users/ty/dev/.worktrees/corpus-agent-kit/autopilot-phase1`, implementation commit
`536d1fb6f4943cb1bae5549a307c3a58889e04c3`:

- `npm test` — exit 0: 114 autopilot tests and 6 MCP bridge tests (120 total),
  plus plugin/Codex skill drift checks. Includes 64 sourced-planning tests and
  17 in-process HTTP tests. All tool/model calls mocked; no sockets or live calls.
- `npm run typecheck` — exit 0 across all three workspaces.
- `npm run build` — exit 0 across all three workspaces, including widget budgets.
- `git diff --check` and exact wire-contract `cmp` — exit 0.

Logs are preserved under `/Volumes/WorkSSD/Artifacts/corpus/autopilot-phase1-20261025`.
The initial socket-based HTTP tests failed with sandbox `listen EPERM`; they were
replaced by direct invocation of the real HTTP listener, and the full gate above
then passed. No dependencies, credentials, provider settings or billing changed.
Ty-assigned Opus 5.5 reviewed the initial implementation (APPROVE_WITH_NITS, no P0/P1);
the follow-up review confirmed all four P2 corrections resolved, with no P0/P1/P2.
Nothing has been deployed.
The implementation branch is pushed; draft PR: https://github.com/teakesdev/corpus-agent-kit/pull/11.

The controller took over after the delegate's sandbox could not write linked
Git metadata. Controller integration adds the actual catalog intake fields,
bounded intake/step context for Qwen ordering, multiline description normalization,
and stricter handoff query/fragment checks. The web tests consume an actual
`buildPlan` fixture including an IRS source and a 1,079-character offer qualifier.
No secret or live offer is contained in that fixture.

Corpus web implementation landed as `df44673fdab41da7ca497743d82da58e51886d01` after its
local unit/typecheck/docs gate. Its new route policy resolves the concurrent Phase 0 replay
finding with masks and a blocked prefill link. This is not independent review or deployment.


## Review corrections — 2026-10-25

Code commit `a4454e5a565e5df07bc548c19e77119fa189779f`, tested from
`/Users/ty/dev/.worktrees/corpus-agent-kit/autopilot-review-fixes`:

- IRS guide entry states that no excerpt was retrieved; Corpus guide text keeps its own source.
- Tool budgets account for remaining overall time and reserve 500 ms to return partial results;
  optional model ordering is skipped when time is short. Parent disconnect still cancels work.
- UUID rules match the web; full-provision excerpts are bounded and visibly truncated.
- Unsupported combinations get categorical errors, exact city/state suffixes are accepted, and
  local search uses fixed keywords instead of the founder's activity sentence.
- Actual Corpus formatter fixtures cover requirements, search, coverage and handoff parsing.

Controller independently reran `npm test` (143 autopilot + 6 MCP bridge = 149 tests, no skips),
`npm run typecheck` and `npm run build`; all exited 0. Wire contracts and the shared hosted fixture
compare byte-for-byte. Tools/models are mocked; no live metered call or filing occurred.

Web fixes separately preserve progress through refresh, use monotonic quote age and respect the
public order-pause signal. Deploy FC before the matching web revision, under separate authorization.
Monitor shared free-tier credits and regulatory-notes cost during the article pilot; coverage caching
is deferred. The 20-plan qualitative review remains open. Phase 2 token/email helpers in Corpus are
foundations only; no public email or durable-resume endpoint is enabled.
