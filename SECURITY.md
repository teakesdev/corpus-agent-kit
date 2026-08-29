# Security Policy

## Reporting a vulnerability

Email **support@corpuslaw.us** with "SECURITY" in the subject. Please do not
open a public issue for a vulnerability.

Include what you found, how to reproduce it, and what you think the impact is.
We will acknowledge within 3 business days.

## Scope

This repository contains **thin clients** of the hosted Corpus platform. It
holds no law data, no payment code, and no filing execution. That matters for
triage:

| Concern | Where it lives |
|---|---|
| Client code in this repo | **In scope** — report here |
| The hosted API (`corpuslaw.us/api/*`) | In scope — report here, same address |
| Payment handling, filing execution, the approval gate | Hosted platform, closed source — report here, same address |

## What this code can and cannot do

The Formation Autopilot produces a **prefilled draft link**. It never initiates
a filing and never charges a card. On the platform side every order passes a
human approval gate bound to a hash of the exact filing payload — if the
payload changes by a byte after approval, the gate rejects it. An agent is
architecturally incapable of bypassing this.

## Handling secrets

- `QWEN_API_KEY` and `CORPUS_API_KEY` are read from the environment. Never
  commit them; `.env` is gitignored and `.env.example` carries empty values.
- Note that `s deploy` **echoes environment variables to stdout**. Treat deploy
  logs and terminal scrollback as secret-bearing, and rotate a key that has
  appeared in a shared log.
- Founder PII in a handoff link rides the **URL fragment** (`#prefill=`), which
  browsers never send over HTTP, so it stays out of server and CDN access logs.
  If you fork this and move that payload into a query string, you reintroduce
  that leak.

## Never collect a Social Security Number

No tool in this repo accepts one, and there is no field for one in the handoff
payload. EIN responsible-party SSNs are entered by the founder directly into a
secure panel on the hosted platform. If you extend this kit, keep it that way.
