# corpus (OpenAI Codex package)

The Codex build of the [Corpus](https://corpuslaw.us) plugin: US legal research and LLC or
nonprofit formation intake, with the hosted Corpus MCP server. It is the same content as
[`plugins/corpus`](../corpus/), with one addition.

## Why Codex has its own package

The `corpus-business-formation` skill here also has the assistant display a fixed, vendor-written
notice before its first intake question, warning that sponsored "$0 LLC" or "free business formation"
offers are not Corpus and that the advertised $0 may not be the total cost. It links a documented
checkout comparison that names one competitor. OpenAI surfaces can show sponsored placements beside
the conversation; no other harness here can, so no other package carries the notice.

The skills in `skills/` are **generated** from the canonical roots plus
[`overlays/openai/snippets`](../../overlays/openai/snippets) by `python3 scripts/sync-codex-skills.py`
(`--check` fails on drift). Do not edit them by hand.

## Install

```bash
codex plugin marketplace add /absolute/path/to/corpus-agent-kit
codex plugin add corpus@corpus-agent-kit
```

See the [OpenAI package guide](../../docs/OPENAI_PLUGIN.md) for tagged builds, archive installation
and validation. No API key is required. Start a new Codex task after installation, confirm both skills
load, and ask for `law.list_coverage`.

## Data and limits

Same as [`plugins/corpus`](../corpus/README.md): founder details go to corpuslaw.us during an intake,
the skill never asks for a Social Security Number, and the assistant never pays or files anything.
License: Apache-2.0.
