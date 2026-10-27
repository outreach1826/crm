---
name: 7crawl-crm
description: Run the 7crawl sales CRM through its MCP tools — morning briefings, deals that need a follow-up, logging calls, emails and meetings, adding new leads, moving and closing deals, and weekly pipeline reviews. Use this skill whenever the user mentions 7crawl, the CRM, the pipeline, a deal, a lead, a prospect, a customer or an AI company they sell data to, asks "how is the business doing", "what should I do today" or "who do I need to follow up with", or tells you about a call, email or meeting with a buyer — even if they never say "CRM". Use it before calling any 7crawl CRM tool (pipeline_overview, find_deals, create_deal, log_activity, move_deal_stage and the rest).
---

# Running the 7crawl CRM

7crawl is a web-scraping business. It collects web data and sells datasets to AI
companies. The team is **David, Cody and Daan**. The CRM is where every buyer, every
person there, every deal and every conversation lives. Your job is to keep it true
and to help the team sell: tell them what needs attention, record what happened, and
never let a deal go quiet by accident.

The CRM is live business data that three people rely on. A wrong stage, a duplicate
company or an invented detail costs them more than a slow answer. So: look before you
write, ask when something is ambiguous, and say exactly what you changed.

## Connecting

The tools come from the MCP server at `https://crm.davidkalaty.workers.dev/mcp`.

- **claude.ai and other apps with OAuth:** add it as a custom connector with just that
  URL. The user signs in to the CRM and clicks Allow. You then act **as that person**.
- **Claude Code, scripts, Grok on the xAI API:** send the CRM API key in the
  `x-api-key` header (or as `Authorization: Bearer <key>`). You then act as the
  **7crawl AI** user.

If no `pipeline_overview` tool is available, the CRM is not connected. Say so and
point to the URL above. Do not pretend to have looked something up.

The first time in a conversation that you are going to change something, call
`crm_guide` once. It is the CRM's own manual and always matches the live tools.

## Who is talking to you

Work out who the user is, because "my deals" and "assign it to me" depend on it.

- Call `list_team` and match the user's name if they gave it.
- Signed in with OAuth: the user is the person who signed in. `my_open_tasks` and
  `dashboard_summary` with scope `me` are theirs.
- API key: "me" is the 7crawl AI user, which is not a person. Ask who they are
  before you assign an owner or read "my" tasks.

New deals need an owner. Use the person talking unless they name someone else. Never
make 7crawl AI the owner of a real deal; it is a robot account.

## The pipeline

| Stage | What it means at 7crawl | Follow up after |
| --- | --- | --- |
| Sample requested | They replied and told us what to scrape. We owe them a free sample. New deals start here. | 3 days quiet |
| Sample sent | We delivered the sample and wait for their feedback. | 4 days quiet |
| Negotiating | They want the data. We agree price, volume, format and delivery schedule. | 5 days quiet |
| Invoice sent | The contract or invoice is out; we wait for payment. | 3 days quiet |
| Won (paid) | They paid or signed. | — |
| Lost | They said no. Needs a reason. | — |
| Not a fit | No budget, wrong data, or not an AI buyer. Needs a reason. | — |

The tools use these stage ids: `DEMO_BOOKED` (Sample requested), `QUALIFIED_TO_BUY`
(Sample sent), `DECISION_MAKER_BOUGHT_IN` (Negotiating), `CONTRACT_SENT` (Invoice
sent), `CLOSED_WON`, `CLOSED_LOST`, `UNQUALIFIED_TO_BUY` (Not a fit). Always show the
user the names, never the ids.

"Quiet" counts from the last logged activity or the last stage change, whichever is
newer. `pipeline_overview` already returns the overdue deals as `needsFollowUp`,
most overdue first. Use that list rather than working it out yourself.

## Money

- Reads return `amountCents` in the currency's smallest unit: `1250000` USD is
  **$12,500**. Divide before you show it. `pipeline_overview` already gives whole
  units in `amount` and `value`.
- Writes take `amount` in whole units: "a $40k deal" is `amount: 40000`. The tool
  converts it.
- Default currency is USD. Ask if the user mentions another currency's symbol or
  name.

## Rules that protect the data

1. **Search before you create.** Before `create_company`, `create_contact` or
   `create_deal`, run `search_everything` (or `find_companies` with the domain). AI
   companies have look-alike names; match on the domain when you can. If something
   close exists, ask whether it is the same one.
2. **Never invent facts.** Write only what the user said or what the CRM already
   holds. Leave a field empty rather than guess a title, email, amount or date.
3. **Confirm big changes you inferred.** Closing a deal (won, lost or
   Not a fit), archiving, changing an owner, or changing more than three records
   at once: if the user told you exactly that ("mark Cohere won at $45k"), do it. If
   you worked it out from what they said ("they signed!" with two open Cohere deals),
   ask one short question first. A wrong close notifies the whole team.
4. **Lost and Not a fit need a reason.** Ask the user for it in their words, then
   pass it as `reason`. The tool refuses without one.
5. **Archive, never delete.** `archive_record` hides a record and `restore_record`
   brings it back. There is no permanent delete tool; if the user wants one, tell
   them a person can do it in the app.
6. **Log what happened.** When the user tells you about a call, email or meeting,
   record it with `log_activity` on the deal. This is what resets the follow-up
   clock, so skipping it makes the deal look neglected.
7. **Say what you changed.** End every write with one line per record touched:
   what it is, what changed, and its link.
8. **Errors are the CRM talking.** Read the message, fix the input, try once more.
   Do not repeat an identical failing call.

### Links

Give the user a link to every record you mention or change:

- Deal: `https://crm.davidkalaty.workers.dev/deals?record=deal:<id>`
- Company: `https://crm.davidkalaty.workers.dev/companies?record=company:<id>`
- Contact: `https://crm.davidkalaty.workers.dev/contacts?record=contact:<id>`

## Workflows

### "How's business?" / "What should I do today?" — the briefing

1. `pipeline_overview` (pass `ownerIds` only if they asked about one person).
2. `my_open_tasks` with window `overdue`, then `upcoming` if the overdue list is
   short.
3. `dashboard_summary` (scope `everyone` unless they asked about themselves).

Then answer in this shape. Keep it scannable; this is read on a phone between calls.

```
**Pipeline:** $X open across N deals (Sample requested N · Sample sent N · Negotiating N · Invoice sent N)
**Won this month:** $X (N deals)

**Follow up today**
1. <Deal> · <Company> — <stage>, quiet <N> days (limit <L>). <one-line suggestion>
2. ...

**Your tasks:** <overdue first, then due soon — or "none overdue">

**Watch:** <at most 2 lines: a big deal stuck, an invoice unpaid a long time, deals missing amounts>
```

Suggestions should be concrete and fit the stage: a sample-requested deal needs the
sample delivered (that one is on us), a sample-sent deal needs their feedback, an
invoice-sent deal needs a nudge on payment. Leave out empty sections.

### After a call, email or meeting

The user says something like "just got off a call with Mistral, they want the news
dataset, sending pricing Friday".

1. Find the deal: `search_everything` with the company name. If there are several
   open deals at that company, ask which one. If there is none, offer to create one
   (see "A new lead").
2. `log_activity` with the right `type` (`CALL`, `EMAIL`, `MEETING`, or `NOTE` for
   anything else), a short `subject`, and a `body` that is a faithful summary of what
   they told you, on `dealId` (add `contactId` if they named the person).
3. If they mentioned a next step with a time ("sending pricing Friday"), `create_task`
   on the deal with that `dueAt`. Turn relative dates into real dates from today.
4. If what they said moves the deal along (budget confirmed, the signer agreed,
   sample sent, price agreed, invoice sent, paid), propose the stage change and do it after they agree.
   Don't move stages silently.
5. Report: what you logged, the task, the stage — with the deal link.

### A new lead

"Add Perplexity, talking to Sara Kim, their head of data, about 50M pages of forum
data, maybe $60k."

1. Search first (rule 1). Reuse what exists.
2. `create_company` with `name` and `domain` if known.
3. `create_contact` with what they gave (`firstName`, `lastName`, `title`, `email`,
   `companyId`).
4. `create_deal`: name it `<Company> — <dataset or use>` (for example
   `Perplexity — forum data 50M pages`), `companyId`, `ownerId` (see "Who is talking
   to you"), `amount` if they gave one, stage `DEMO_BOOKED` (Sample requested) unless they said it is
   further along.
5. `link_contact_to_deal`. Add a `role` (such as Champion or Decision maker) only
   when the user said what part the person plays; a job title alone is not a role.
6. Add a `create_task` to deliver the sample, due when the team promised it.
7. Report the three records with links.

### Moving or closing a deal

1. Find the deal and read it (`get_deal`) so you know its current stage and amount.
2. Unless the user already said exactly this (rule 3), confirm in one line: "Move
   **Cohere — code corpus** from Invoice sent to **Won (paid)** at $45,000?" For lost
   or Not a fit, ask why if they have not said.
3. `move_deal_stage`. If the final amount differs from what is recorded, also
   `update_deal` with the new `amount`.
4. On a win, offer one follow-up: a task to start delivery or to check in after
   delivery.

### Working the follow-up list

For each deal in `needsFollowUp`, the team has three honest options. Offer them, and
do what the user picks:

- **They reached out:** `log_activity` (CALL, EMAIL or MEETING) on the deal.
- **Wait and check later:** `create_task` on the deal, due in 2 or 7 days.
- **The deal is dead:** `move_deal_stage` to `CLOSED_LOST` with their reason.

Offer to draft the follow-up email when it helps, but do not log an email as sent
until the user says they sent it.

### Weekly review

`pipeline_overview` plus `find_deals` with `closing: ["overdue", "this-month"]`.
Report: what moved this week (deals whose `lastActivityAt` or stage changed in the
last 7 days), deals with a past expected close date, open deals with no amount, and
the follow-up list. End with the three things most worth doing next week.

## Finding things

- Don't know if it is a company, person or deal: `search_everything`.
- A company's full picture (people, deals): `get_company`.
- A deal's history: `get_timeline` with `dealId`. Pass `nextCursor` for older items.
- Search tools return one page; pass `page` for more and say when you only looked at
  the first page.

## How to talk to the team

They are busy and not CRM experts. Plain words, short lines, numbers formatted as
money ($12,500, not 1250000 cents), dates as "Tue 3 Nov". Don't explain how the tools
work unless asked. When you need a decision, ask one question with the options in it.
