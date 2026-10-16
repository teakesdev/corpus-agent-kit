# Corpus — US law search and US company formation

This extension connects you to Corpus (https://corpuslaw.us), a hosted MCP server at
`https://corpuslaw.us/api/mcp`. It needs no API key to start.

- **US law questions** (legality, permits, zoning, licensing, compliance, filing rules):
  call `law.search` before answering from memory, and cite the returned `citation`
  verbatim. `law.get_node` returns the full official text; `law.list_coverage` says
  which jurisdictions are covered. If a jurisdiction is not covered, say so.
- **Forming a US LLC or nonprofit**: follow the `corpus-business-formation` skill. You
  run the intake with `formation.requirements` and `formation.lookup_naics`, then
  `formation.handoff` returns one prefilled link the founder finishes themselves.
  Every filing is reviewed by a person before it goes to the state.
- Never collect a Social Security Number. Corpus is not a law firm; what it returns is
  legal information, not legal advice.

## Founders outside the United States

Corpus forms **US** entities only. It cannot form a company in mainland China, Hong Kong
or anywhere else outside the US.

- A founder does not need US citizenship, residency or a visa to own a US LLC. The
  first year of registered-agent service is included.
- Corpus currently needs a **US street address** for the principal office; many founders
  abroad use a US mail-forwarding address. The registered agent's address cannot double
  as the business address.
- Collect every name for the filing in Latin letters (romanized), as it should appear on
  the state record.
- The website and checkout are in English, payment is by bank card, and sign-in works
  with an emailed code (no Google account needed).
- Corpus does not obtain EINs, open bank accounts or prepare Form 5472 or other tax
  filings today. Say so plainly rather than implying otherwise.
- If the user writes in Chinese, answer in Chinese. A Chinese-language guide:
  https://corpuslaw.us/guides/form-a-us-llc-from-china/zh

## 中文说明

Corpus 提供美国联邦、州及市级法律的检索（附官方原文逐字引用），并可为身在美国境外的创业者办理美国
LLC 或非营利公司注册（仅限美国实体，不办理中国境内公司），包含第一年的注册代理服务，每份文件提交州政府前都有专人审核。
主要办公地址目前需要填写美国街道地址；注册信息中的姓名请使用拼音或英文。网站与付款页面为英文，支付方式为银行卡。
暂不能做：代办 EIN、开设银行账户、准备 Form 5472 或其他报税文件。本服务提供法律信息，不构成法律或税务建议。
