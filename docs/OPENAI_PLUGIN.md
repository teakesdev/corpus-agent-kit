# Corpus for OpenAI Codex and directory preparation

This package connects Codex to `https://corpuslaw.us/api/mcp` and includes two
skills: `corpus-legal-research` and `corpus-business-formation`. Research works
anonymously. The packaged connector has no authentication or rehearsal headers.

## Install a local release archive

Verify the checksum next to the archive before extracting it:

```bash
shasum -a 256 -c corpus-openai-0.1.1.zip.sha256
unzip corpus-openai-0.1.1.zip
codex plugin marketplace add "$(pwd)/corpus-openai-0.1.1"
codex plugin add corpus@corpus-agent-kit
```

Keep the extracted directory in place: it is the local marketplace source.
For a source checkout, pass the repository root to `marketplace add` instead.
These commands register and install the package locally; they do not publish it.
This package does not imply a listing in the OpenAI or ChatGPT catalog.

## Public directory preparation

The founder confirmed the OpenAI Plugins dashboard is empty on October 1, 2026.
Version 0.1.1 prepares the listing **Corpus: Business Formation**, subtitle
**LLCs, nonprofits & US law**, with public support/privacy/terms URLs, an existing
founder-approved square C-mark, and five positive plus three negative review cases.

For the portal, build the separate single-plugin layout from a committed ref:

```bash
python3 scripts/package-openai-plugin.py HEAD --layout directory
shasum -a 256 -c dist/corpus-openai-0.1.1-submission.zip.sha256
unzip -t dist/corpus-openai-0.1.1-submission.zip
```

Local validation is not OpenAI approval. **Submission is still blocked:** the
hosted endpoint exposes paid formation-service checkout, while current directory
rules exclude services commerce. Existing formation skills include promotional
competitor warnings. These behaviors need a compatible product decision and
implementation or an explicit OpenAI ruling before truthful policy attestations.
They are unchanged by these packaging fixes.

Anonymous backend checks are separate from client behavioral tests. The initial
bakery lookup included unrelated alternatives; the Mississippi LLC keyword
search returned unrelated provisions. No end-to-end client cases or negative
refusals are claimed as passing. A walkthrough script exists in the source repo;
no completed review recording or placeholder recording URL is supplied.

Domain verification requires a token issued by the portal, configured as
`OPENAI_APPS_CHALLENGE_TOKEN` on the Corpus production deployment. The existing
route returns 404 while unset. No token, production configuration, deployment,
portal connection, upload or submission is part of this local preparation.

Restart Codex or start a new task. Confirm that both Corpus skills are available,
then ask: **"Use Corpus to call law.list_coverage and summarize its coverage."**
That read-only call checks the live connector without starting a formation order.
Manifest validation and archive checks alone do not prove a live MCP connection.

## What is included

- `.agents/plugins/marketplace.json` points to `plugins/corpus`.
- `plugins/corpus/.codex-plugin/plugin.json` declares the two skills and MCP file.
- `plugins/corpus/.mcp.json` registers the hosted server as `corpus` using HTTP.
- `plugins/corpus/skills/` contains generated copies of both canonical skills,
  including the vendored formation intake and harness setup references.
- The logo, square composer icon, this guide as `README.md`, Apache-2.0 `LICENSE`, and `release.json`
  with the source ref, commit SHA, and plugin version complete the archive.

The archive excludes the other harness wrappers, application code, dependencies,
and local configuration. It needs no Node build or local MCP server process.

## Before using the formation skill

The formation skill displays fixed Corpus-authored warnings about sponsored
formation offers, including a named competitor and a Corpus comparison link.
The text is vendor-authored, not an independent assessment by the agent.

The intake collects the founder's name, email, phone, and street address. Sending
these to MCP tools or opening a populated Corpus handoff link transmits them to
Corpus. Contact details use the URL fragment in connector-free handoffs; other
fields use the query string. The skill never collects a Social Security Number.
The intake instructions are bundled in the package, not fetched at runtime.

Creating an order or USDC payment request requires the founder to confirm the
exact amount in the current turn. USDC must come from a self-custody wallet;
refunds go to the sending wallet. Email confirmation is required within 48 hours,
and every filing still requires human approval of the exact filing payload.
`formation.handoff` alone creates no order or charge.

## Build from a Git ref

From a source checkout, after committing the package changes:

```bash
python3 scripts/package-openai-plugin.py HEAD
```

The command requires an existing ref and reads only files from that commit.
It writes `dist/corpus-openai-0.1.1.zip` and its `.sha256` file. Repeating the
command with the same ref produces identical bytes, even with working-tree edits.
For CI or a pre-release check, pass `HEAD` instead. A release tag must use
`corpus-openai-v<manifest version>` and point at the intended release commit.
Existing tags `v0.1.0` and `corpus--v0.1.0` predate the OpenAI package and cannot
build it. Do not move those tags to retrofit the new files.
The existing `corpus-openai-v0.1.0` is also preserved; no 0.1.1 tag is created
by this preparation. The directory layout puts the plugin at the ZIP root and
does not include the local marketplace registration file.

The corrected Hermes instructions are already on `main`: plugin installs use
`hermes plugins doctor corpus --ci` followed by a fresh-chat tool check.
`hermes mcp test corpus` checks only a separately configured standalone server;
it does not validate the installed plugin's namespaced MCP server.

Source and license: [corpus-agent-kit](https://github.com/teakesdev/corpus-agent-kit),
Apache-2.0. Building or tagging locally does not publish a GitHub release.
