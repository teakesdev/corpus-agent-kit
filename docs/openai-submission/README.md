# Informational submission preparation — 2026-10-01

The 0.1.2 archive supersedes 0.1.1. It has a separate OpenAI endpoint and two informational skills. Five positive and three negative cases are bundled. Package validation is local; deployment, domain verification, tool scan, client behavior and a recording remain unverified.

Backend source: Corpus session/openai-source-repair-20261001. No production deployment or data repair was performed. The historical review-checks-2026-10-01.json describes the old /api/mcp surface, including its failed law-content case. It is not a passing receipt for the informational endpoint.

The local parser repair must be deployed and affected law data reprocessed through the signed ingestion path, including stale-chunk reconciliation, under separate approval. Do not claim production citations are repaired by a source-code change.

After deploying the endpoint: confirm exactly the five allowlisted tools, reject service/billing aliases, run the eight connected-client review cases, and record the walkthrough. Uploading this ZIP only prepares a portal draft; do not submit for review while these checks are outstanding.
