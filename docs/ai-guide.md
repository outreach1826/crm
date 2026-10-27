# 7crawl CRM — guide for AI assistants

You are connected to the CRM of **7crawl**. 7crawl is a data-scraping business. It
collects web data and sells datasets to AI companies. The team is David, Cody and
Daan. The CRM holds every company 7crawl sells to, the people there, the deals in
progress and the history of every conversation.

Read this guide once. Then use the tools. Every tool reads or changes live business
data, so follow the rules at the end.

## The records

| Record | What it is |
| --- | --- |
| **Company** | An organisation 7crawl sells to, for example an AI lab. Has a name, a domain, an owner and custom fields. |
| **Contact** | A person, usually at a company. Has a name, email, phone, title and owner. |
| **Deal** | One sale in progress with one company. Has a stage, an owner, an amount, a currency and an expected close date. Contacts link to deals with a role. |
| **Activity** | A note, call, email, meeting or task on a company, contact or deal. Activities form the timeline. |
| **User** | A team member. `list_team` returns their ids. Every deal has an owner. |

Every record has an `id`. Tools that change a record need that id. Find ids with
the `find_*` tools, `search_everything` or `pipeline_overview`.

## Deal stages

Deals move left to right. The board in the app shows one column per stage.

| Stage | Label | Meaning |
| --- | --- | --- |
| `DEMO_BOOKED` | Demo booked | A first call or demo is on the calendar. New deals start here. |
| `QUALIFIED_TO_BUY` | Qualified to buy | The company needs the data and has budget. |
| `DECISION_MAKER_BOUGHT_IN` | Decision maker in | The person who signs agrees. |
| `CONTRACT_SENT` | Contract sent | The contract or order form is out. |
| `CLOSED_WON` | Closed won | The customer signed. |
| `CLOSED_LOST` | Closed lost | The customer said no. Needs a reason. |
| `UNQUALIFIED_TO_BUY` | Unqualified | The company is not a fit. Needs a reason. |

The first four stages are **open**. The last three are **closed**. Use
`move_deal_stage` to change a stage. Ask the user for the reason before you close a
deal as lost or unqualified.

## Follow-ups

An open deal goes **quiet** when nobody logs an activity on it. The quiet time
counts from the latest activity or the latest stage change, whichever is newer. A
deal needs a follow-up when it is quiet for longer than its stage allows:

| Stage | Limit |
| --- | --- |
| Demo booked | 7 days |
| Qualified to buy | 7 days |
| Decision maker in | 5 days |
| Contract sent | 3 days |

`pipeline_overview` returns the list `needsFollowUp`, most overdue first. To clear a
deal from the list:

- **The team contacted the customer:** `log_activity` with type `CALL`, `EMAIL` or
  `MEETING` and the `dealId`.
- **Wait and check later:** `create_task` on the deal, due in 2 or 7 days.
- **The deal is dead:** `move_deal_stage` to `CLOSED_LOST` with a reason.

## Money

- Reads return amounts as `amountCents` in the currency's smallest unit. 1250000
  `amountCents` in `USD` is $12,500.00. `pipeline_overview` already returns whole
  units in `amount` and `value`.
- Writes (`create_deal`, `update_deal`) take `amount` in whole units, for example
  `12500` for $12,500. The tool converts it.
- Totals use the reporting currency. Deals in a currency without an exchange rate
  stay out of totals. `notInTotals` counts them.

## Archive, never delete

`archive_record` hides a deal, company or contact. `restore_record` brings it back.
No tool deletes data permanently. Only a person in the app can do that.

## Tools

### Read

| Tool | Use it to |
| --- | --- |
| `crm_guide` | Read this guide. |
| `pipeline_overview` | See every stage, its value, every deal and the follow-up list. Start here. |
| `dashboard_summary` | Get the headline numbers: won this month, win rate, trend, biggest open deals, overdue tasks. For the team (`everyone`) or the key owner (`me`). |
| `find_deals` | Search and filter deals by words, status, stage, owner or close date. |
| `get_deal` | Read one deal in full. |
| `find_companies` / `get_company` | Search companies / read one in full. |
| `find_contacts` / `get_contact` | Search people / read one in full. |
| `search_everything` | Search companies, contacts and deals at once. |
| `get_timeline` | Read the activities on one company, contact or deal. |
| `list_team` | Get user ids for owners. |
| `my_open_tasks` | Read the open tasks of the key owner. |

### Write

| Tool | Use it to |
| --- | --- |
| `create_company` / `update_company` | Add or change a company. |
| `create_contact` / `update_contact` | Add or change a person. |
| `create_deal` / `update_deal` | Open or change a deal. Not the stage. |
| `move_deal_stage` | Move a deal to a stage. |
| `link_contact_to_deal` | Put a person on a deal with a role. |
| `log_activity` | Record a note, call, email or meeting. |
| `create_task` / `complete_task` | Add a to-do with a due date / mark it done. |
| `archive_record` / `restore_record` | Hide or bring back a record. |

Search and list tools return one page. Pass `page` for the next page. Timelines
return `nextCursor`; pass it as `cursor` for older entries.

## Rules

1. **Search before you create.** Use `search_everything` or `find_companies` first.
   Do not add a second copy of a company, contact or deal.
2. **Never invent facts.** Write only what the user told you or what you read in
   the CRM. Leave a field empty when you do not know it.
3. **Confirm before big changes.** Ask the user before you close a deal, archive a
   record, change an owner or change many records at once.
4. **Log what happens.** After a call, email or meeting the user tells you about,
   use `log_activity` on the deal. This keeps the follow-up list correct.
5. **Say what you changed.** After every write, tell the user the record and the
   change.
6. **Errors are messages from the CRM.** Read them, fix the input and try again.
   Do not retry the same call without a change.

## Connecting

- **MCP endpoint:** `https://crm.davidkalaty.workers.dev/mcp` (Streamable HTTP).
- **Authentication:** a CRM API key in the `x-api-key` header, or
  `Authorization: Bearer <key>`.
- **This guide as a file:** `https://crm.davidkalaty.workers.dev/mcp/guide`.
- **Raw REST API:** every function is also at `https://crm.davidkalaty.workers.dev/rest/...`
  with the same key. The full list is at
  `https://crm.davidkalaty.workers.dev/openapi.json`.
