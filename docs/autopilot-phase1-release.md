# Phase 1 sourced planning backend

## Deployment state — 2026-10-26

The approved Function Compute code-only deployment is complete at source commit
`cb3999ba87ebf914e01407902aaea1716be946f0`, with FC code checksum
`13529343312431775614`. Runtime, environment and function configuration were verified
unchanged. The matching Corpus web is live at source
`c31b01adb307ad37302292f25ef03a67855f5bbd`, deployment
`dpl_8wG2Rqp8yZqYdbAaWxkkk8VeagaA`
([deployment URL](https://corpus-4hw3j0gf6-teakesdev-7793s-projects.vercel.app)).
Final production postchecks are pending;
the Autopilot email feature flag remains `false`. This is not a completed email launch.

Production smoke exposed unrelated annual-report and aircraft-registration search
matches in an MS LLC software-consulting plan. The deployed relevance mitigation
withholds every broad annual-report, tax-registration and local-license search
result from the plan's source ledger and item bindings. Search calls remain only
in the diagnostic tool trace; they do not verify a plan statement. The first tax
hit is no longer promoted through `law.get_node`. Reviewed guide/catalog sources,
exact local coverage status and explicit unverified-provision gaps remain.
There is no heuristic or model-based applicability approval.

The initial postdeployment FC smoke returned HTTP 200 in 3.85 seconds, with
7 items, 7 guide/catalog sources, zero law sources and all item bindings resolving.
The safe deployment receipt is
`/Volumes/WorkSSD/Artifacts/corpus/autopilot-production-rollout/fc-relevance-deployment.json`.
This check does not complete the email, alert or qualitative source-review pilot.

The mitigation received independent Opus approval. At the exact deployed source
commit, `npm test` passed 144 Autopilot tests and 6 MCP bridge tests plus plugin/Codex
skill drift checks; `npm run build`, `npm run typecheck` and `git diff --check` all
exited 0. Logs and the commit/checkout/command manifest are preserved under
`/Volumes/WorkSSD/Artifacts/corpus/autopilot-production-rollout/source-relevance/cb3999ba87ebf914e01407902aaea1716be946f0/`.
Removing the remaining diagnostic-only searches is a follow-up suggestion, not
part of this deployed mitigation. The 20-plan qualitative review remains open.

## Backend contract

The FC API adds `POST /api/plan` (`PlanInput` → `PlanResponse`) and
`POST /api/plan/handoff` (`PlanInput` → `PlanHandoff`). Wire types are mirrored
in `autopilot/src/plan-contract.ts`. `/api/chat` remains available.

Deploy FC before the web frontend, under separate deployment authorization.
An older FC returns 404: the frontend must preserve input and show its unavailable
fallback, never render legacy generated legal prose as a sourced plan.

Plans use the hosted requirements catalog and reviewed guide sources. Broad law
search results are withheld because their relevance to the plan is unverified.
Evidence binding establishes provenance, not applicability or completeness.
Unknown requirements remain Needs checking. No purchase or filing happens here.

The plan accepts only the seven `PlanInput` fields, bare US state/DC codes or
null, and `llc`/`nonprofit`/null. All items remain `needsCheck: true`: there is no
applicability checker. Catalog items identify the selected formation state;
tax searches use the operating state. Exact, unambiguous searchable municipal
coverage is required before a diagnostic local search. Neither coverage nor a
successful search establishes applicable requirements. Catalog text-format drift
fails closed.

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
handler backstop), at most five hosted tool calls on the current path (the six-call
guard remains), including three diagnostic searches of two hits each,
4.5s per tool, 128 KiB per tool response, up to twelve plan items, at most eighteen source
records, ten pricing lines/16 KiB, and 96 KiB serialized HTTP response. Optional
Qwen ordering uses the existing fast lane, a 2s timeout, no retries and 256 output
tokens. Model IDs are intersected with candidates; all candidates remain present.
Failures retain deterministic items. Total planner timeout returns generic 504.
Disconnects cancel downstream requests. No diagnostics or plan text are logged.
The existing process-local hourly request counter is shared with `/api/chat`;
it is not a global dollar cap and its configuration is unchanged. Legacy chat
keeps its behavior, with a new 64 KiB/5s body-buffer safety limit.

## Initial validation history — 2026-10-25

Initial validation, from
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
Deployment had not occurred at this initial validation; the current deployed
state is recorded above. The implementation and mitigation are pushed on existing
PR [#11](https://github.com/teakesdev/corpus-agent-kit/pull/11); it was unmerged at deployment and subsequently merged as `a53fd68299eaf1dc1529122742c4e0e3eeb1f648` on 2026-10-26 at 05:11:48 UTC.

The controller took over after the delegate's sandbox could not write linked
Git metadata. Controller integration adds the actual catalog intake fields,
bounded intake/step context for Qwen ordering, multiline description normalization,
and stricter handoff query/fragment checks. The web tests consume an actual
`buildPlan` fixture including an IRS source and a 1,079-character offer qualifier.
No secret or live offer is contained in that fixture.

The initial Corpus web implementation landed as `df44673fdab41da7ca497743d82da58e51886d01` after its
local unit/typecheck/docs gate. Its new route policy resolves the concurrent Phase 0 replay
finding with masks and a blocked prefill link. That initial landing was not deployment;
the current live web source is recorded above.


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
public order-pause signal. The approved FC and matching web deployments are recorded above.
Monitor shared free-tier credits and regulatory-notes cost during the article pilot; coverage caching
is deferred. The 20-plan qualitative review remains open. Corpus Phase 2 resume/delete
endpoints are deployed and passed the public 404/200 fake-token smoke checks;
the email-status endpoint reports disabled. The cleanup cron is registered, with
scheduled-run success still pending. New email sending remains disabled pending checks.
