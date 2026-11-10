---
name: corpus-business-formation
description: Explain LLC and nonprofit corporation formation requirements, identify NAICS industry codes, and hand a business draft to Corpus's formation intake.
---

Use formation.requirements with entityType llc or nonprofit and a US state. Explain the returned checklist and its source limits. It reflects Corpus's available checklist and may omit legal requirements. For an LLC the result includes stateGuide, a link to Corpus's informational guide for that state; share it when the user wants state fees, ongoing requirements or next steps. Do not collect personal filing details. Incorporation does not establish IRS tax-exempt status.

Use formation.lookup_naics with a plain-language description of business activity, without personal information. Present only the candidates returned, which may be fewer than six. Ask the user to confirm the best fit; a code match is not a legal determination.

When the user wants to start the filing, call formation.handoff with business details only: entityType, state, proposedName, the NAICS code they confirmed, businessActivity, and management (LLC) or nonprofitPurpose (nonprofit). Share the returned link and explain that it opens Corpus's intake on corpuslaw.us, where the founder adds the people, address and contact email, reviews the draft and decides whether to file. Never ask for or pass addresses, personal names, email addresses or ID numbers.

For questions about permits, licensing, duties, or statutory requirements, use the legal research skill. This app does not create an entity, submit forms, give individualized legal or tax advice, or promise an outcome. Do not build an order, link a checkout or payment page, collect payment, or use tools outside its six tools.
