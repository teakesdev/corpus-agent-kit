# Corpus informational OpenAI plugin

This OpenAI-specific package provides formation requirements and US business-law research. Its five read-only tools are formation.requirements, formation.lookup_naics, law.list_coverage, law.search and law.get_node. It has a separate endpoint and separate skills; other client packages keep their existing behavior.

The package does not create entities, collect filing data, arrange service orders, take payment, or give individualized legal or tax advice. Checklists are informational, coverage varies, and cited sources require full-text verification. The server rejects all tool names outside the explicit inventory.

The directory ZIP contains .codex-plugin/plugin.json, .mcp.json, skills/ and assets/ directly at its root, plus this guide, LICENSE and a source receipt. It contains no credentials. It points to https://corpuslaw.us/api/mcp/openai. That endpoint must be separately deployed and tested before connecting or submitting for review.

Uploading the package can start metadata and skills checks. It does not deploy the backend or pass MCP review. Domain verification, hosted tool scan, connected-client positive and negative cases, and a reviewer-accessible walkthrough remain separate steps. If authentication is later required, reviewer access belongs in the secure portal form, never in this archive.

The earlier 0.1.1 archive pointed at the service-enabled endpoint and is superseded. Use only the 0.1.2 informational archive for this OpenAI preparation.
