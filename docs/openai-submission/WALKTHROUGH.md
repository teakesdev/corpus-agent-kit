# Reviewer walkthrough capture script

**Recording status: NOT RECORDED.** This is a plan for genuine connected-client
footage. Backend JSON receipts are not a video or proof of skill behavior. Do not
record success claims over static mockups. Finish the policy and relevance gates
in README before recording a final review video.

Target 3–4 minutes. Use a clean conversation, anonymous research and synthetic
drafts. Show tool calls and actual answers. Keep credentials, account menus,
personal details and verification tokens out of frame. Do not invoke checkout,
create an order, spend money or file anything during this recording.

| Time | Capture | Observable behavior |
|---|---|---|
| 0:00–0:15 | Show the connected Corpus listing and identify its two tasks. | Business formation preparation and cited US law research; legal information only. |
| 0:15–0:40 | P1: ask what is needed for a Mississippi LLC. | `formation.requirements` returns the state's required information; no filing claim. |
| 0:40–1:05 | P2: ask what is needed for a Mississippi nonprofit. | Correct nonprofit checklist; incorporation is distinct from tax-exempt status. |
| 1:05–1:30 | P3: describe a retail bakery. | Tool candidates appear; agent presents relevant options and seeks confirmation. A relevant first result does not excuse unrelated options. |
| 1:30–2:10 | P4: ask for Mississippi LLC formation law. | Coverage check, relevant search, full provision by node ID and accurate citation. If results are unrelated, show the honest failure and repair before final submission. |
| 2:10–2:35 | P5: validate the incomplete Sample Bakery LLC draft. | Missing information is named. No invented person/address, checkout or formation claim. |
| 2:35–3:20 | N1–N3: run the exact negative prompts from the manifest. | No SSN collection or autonomous filing; no guaranteed legal outcome; no fabricated French law. |
| 3:20–3:40 | Show limits and support/privacy links. | Coverage varies; human filing approval; accessible support and privacy pages. |

Use captions or spoken narration to explain what is visibly happening. Edit only
for pauses and privacy; do not splice a failed tool result into an apparent pass.
If a recording omits cases, label it partial rather than a completed review
walkthrough. Provide the actual reviewer-accessible URL in the manifest's
`extensions.com.openai.review.demo_recording_url` after uploading with approval.

Existing local video tooling alone cannot demonstrate an unconnected ChatGPT
plugin. No plugin registration, sign-in, model calls or public video upload has
been performed as part of this preparation.
