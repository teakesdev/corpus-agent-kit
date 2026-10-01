# Corpus OpenAI directory submission preparation

Prepared October 1, 2026. The founder confirmed the Plugins dashboard is empty:
**not submitted; not awaiting OpenAI review**. This branch prepares a package;
it does not upload, connect, deploy, publish, push or merge anything.

## Listing copy

- **Title:** Corpus: Business Formation (26 characters)
- **Subtitle:** LLCs, nonprofits & US law (24 characters)
- **Publisher:** Corpus; the portal must use the founder's verified identity.
- **Category:** Productivity

The complete description and three starter prompts are in
[`plugin.json`](../../plugins/corpus/.codex-plugin/plugin.json). The wording names
formation and business-law tasks supported by the production tool catalog. It
does not promise legal advice, tax exemption, complete jurisdiction coverage,
filing without approval, or a particular price. Keywords identify the product's
tasks; they are not a promise of directory ranking.

The square logo/composer icon is an unchanged copy of the founder-approved
`apps/web/public/brand/icon-512.png` in Corpus, 512×512 PNG. It is a dedicated
C-mark, not a stretched crop of the rectangular lockup. The existing other-client
logo and canonical skills are preserved.

## Local package validation

```sh
node scripts/check-plugin-package.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -p 'test_*.py'
bash scripts/check-plugin-skill-drift.sh
python3 scripts/package-openai-plugin.py HEAD --layout directory
unzip -t dist/corpus-openai-0.1.1-submission.zip
```

The directory ZIP places `.codex-plugin/plugin.json`, `.mcp.json`, `skills/` and
`assets/` under one plugin root. The default builder still makes the existing
local-marketplace layout. Build from a committed ref: uncommitted changes are
excluded. Version 0.1.1 is a local preparation version; the existing 0.1.0 tag is
not moved and no new release tag is created.

Local checks validate field lengths, HTTPS URL shapes, included square PNGs,
review-case shape/count and archive integrity. They do **not** establish portal
acceptance, policy approval, or working client behavior.

## Reviewer cases and actual evidence

Five positive and three negative cases are included under
`extensions.com.openai.review.test_cases` in the manifest. Their identifiers are
P1–P5 and N1–N3 in the descriptions. Credentials are not in the package.

[`review-checks-2026-10-01.json`](review-checks-2026-10-01.json) records anonymous
backend checks. Each case separately marks client behavior **NOT RUN**. N1–N3
are drafted behavioral cases, **not executed refusals**. This distinction must
remain in any submission readiness report.

Actual October 1 run: P1, P2, P3 and P5 passed their bounded backend assertions;
P4 failed its relevance assertion. P3's assertion checks only the presence of
the retail-bakery candidate, not the relevance of every alternative. The smoke
command correctly exited 1. All client behavioral cases remain NOT RUN.
Large tool responses are bounded in the receipt with original character counts
and SHA-256 hashes; assertions used the complete responses before truncation.

Additional local verification: eight Python packaging/smoke-safety tests passed;
manifest checks passed. Five native Node assertions against the existing Corpus
challenge route passed with synthetic tokens (exact output, whitespace, unset
404, no-store and request-time environment). These were not a Vitest suite run
and did not change the production token or any Corpus file.

```sh
# Makes bounded requests to public read-only tools; consumes anonymous research quota.
python3 scripts/smoke-openai-review.py --output /tmp/corpus-review-checks.json
```

The harness cannot call checkout, payment-status, account-status or unknown tools.
The early draft uses only a fictional company name and omits all personal data.
Keyword search avoids embedding/model work. A failed relevance check returns
exit 1 and is evidence to investigate, not permission to claim a pass.

## Gates that remain open

1. **Hosted commerce policy conflict.** The public endpoint advertises
   `formation.checkout` and `formation.payment_status`. Requirements/handoff
   responses direct the user to paid formation services. Current directory rules
   allow commerce only for physical goods and exclude paid services, including
   indirect commerce. The manifest truthfully declares this existing behavior;
   changing its declaration to false or omitting a tool from listing copy would
   not fix the integration. Decide and implement a compatible hosted surface, or
   obtain an explicit OpenAI ruling before making the policy attestations.
2. **Promotional skill/server behavior.** Existing formation instructions require
   a competitor-specific warning and steer the user away from alternatives.
   Review these against fair-discovery, user-intent and promotional-content
   requirements. A suitable OpenAI-specific skill and server instruction path
   require a separate decision; other clients' canonical skills are unchanged.
3. **Backend quality.** The bakery lookup contains the relevant 311811 candidate
   and unrelated alternatives. The initial Mississippi LLC keyword search
   returned unrelated provisions. The retrieved node was labeled
   `Miss. Code Ann. § 37-146-17`, but its body begins with Chapter 147 and
   `§ 37-147-1`, indicating a citation/text association problem beyond ranking.
   Inspect the recorded search/full-text results;
   resolve or accurately constrain the reviewer scenario before claiming P4 passes.
4. **Client behavior.** Run all eight prompts through the connected plugin after
   the above changes. Verify citations, coverage disclosure, consent and refusals.
5. **Recording.** [`WALKTHROUGH.md`](WALKTHROUGH.md) is a capture script, not a
   completed video. Record the real connected client, then supply an accessible
   video URL. No placeholder URL is included in the package.
6. **Portal and production steps.** Choose and verify the publisher identity;
   obtain the domain token, deploy it, upload the reviewed ZIP, run the portal
   metadata/skills/tool scans, resolve their findings and complete reviewer details.

Screenshots and dark icon variants are optional; they do not block this package.
Research works anonymously. A reviewer account is needed only for test behavior
that actually requires sign-in; never use the founder's real account or private
credentials in the public ZIP.

## Domain verification (prepared, not deployed)

The existing Corpus route reads `OPENAI_APPS_CHALLENGE_TOKEN` at request time,
trims pasted whitespace, returns it as plain text with `no-store`, and returns
404 while unset. Its five source tests cover exact output, whitespace, missing
token, caching and dynamic execution. No route change is needed in this branch.

The portal must first issue a real token. Then, with separately authorized
production configuration/deployment:

1. Set that token on Vercel project **corpus**, **Production**, as
   `OPENAI_APPS_CHALLENGE_TOKEN`. Do not put it in Git or the public ZIP.
2. Deploy the reviewed Corpus source containing the route. An environment update
   alone does not change an existing deployment.
3. Check `https://corpuslaw.us/.well-known/openai-apps-challenge`: status 200,
   plain-text body exactly matching the portal token, with no JSON or extra text.
4. Complete verification in the portal. Check for an existing challenge used by
   another plugin before replacing a deployed token.

At the October 1 preflight, the challenge returned 404. Privacy, terms, support
and MCP docs returned 200; the public tool catalog returned 10 annotated tools.
That preflight establishes availability, not portal validation or policy approval.

## Separate founder decisions/authorization

- Approve the policy-compatible product scope and any hosted-tool/skill changes.
- Authorize production token configuration and deployment once the portal token
  exists; approve a push/merge separately if desired.
- Authorize portal upload and connection, choose the verified publisher identity,
  and complete identity verification personally.
- Approve the factual policy attestations and final submission after the recorded
  behavior and portal scans pass. Publication after approval is a separate step.

Source of current requirements, checked October 1, 2026:
[submission](https://developers.openai.com/plugins/deploy/submission),
[package guide](https://developers.openai.com/plugins/build/plugins),
[plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).
