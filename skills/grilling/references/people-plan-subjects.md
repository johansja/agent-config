# People-plan subjects (onboarding, ramp, 30/60/90 plans)

Use when the grill's subject is a plan for a person: a new hire's onboarding guide, a ramp plan, a 2-week / 1-month / 3-month plan.

## Pre-fetch before round 1

1. **The person's evidence pack.** Interview artifacts (scorecard, verdict, prep plan, resume) usually sit in a gitignored folder, so follow the file search's hidden-matches warning. Pull the per-axis scores, the named gaps, and the intended seat and level.
2. **The calendar collision.** Lay the start date over the project's roadmap or status-review milestones. A start in a launch week changes the week-1 shape (shadow vs. shield vs. own) more than anything else.
3. **Gap → system mapping.** For every interview gap, find the live system or runbook where it would bite. A gap on a single point of failure (a shared datastore every tenant depends on) gets a rehearsal on a non-prod environment first, so their first touch is not an incident.
4. **Who knows what, from git.** Before recommending a buddy, run `git log --since=<recent> --format='%an' -- <path>` for each area the person will own, plus `git log --author=<name> --name-only` for each candidate. Pair them with the person whose code is on the onboarding path, plus a short session from the real area expert.
5. **Tracker state for anything the plan cites.** If the plan says "run drill X", check whether X was ever run and where the result is recorded. Read comments through the tracker's dedicated comment tool, since a search requesting the comment field can come back empty; write "unconfirmed" only if that read fails.
6. **Where the practised component actually runs.** Map the component to its hosting cluster from the deploy overlays or topology doc before naming a drill environment — the named test environment may run only the platform services. State who goes down during the drill, so the window ask names the right people.

## Questions the frontier usually needs

- **Who reads which part.** Default: one file, top part shareable with the person, bottom section of private manager notes (milestones mapped to gaps, level and ownership calls) removed before sharing. Keep it beside the interview artifacts, not in the product repo, because it names the hire's gaps.
- **Who owns the doc.** If someone else (a team lead) formally owns onboarding, the user drafts and that person owns; mark level and ownership calls as theirs.
- **Ownership by day 90**, plus what they shadow vs. own during any launch. Probe what "production" means; a soft or internal launch allows more involvement.
- **Shared environments.** Practice on a cluster others use needs a named environment, an agreed window with its users, and a fresh backup first — all three as explicit plan steps.
- **First task.** If the tracker is too messy to pick from, let the first MR come out of what the drill or code walkthrough turns up.
- **Where the first task's result is recorded.** Default to a new ticket, unassigned (they may lack an account yet), labelled `onboarding`, linked to the parent with Relates, cited in the guide with "assign on day 1" in the manager notes. Search for a twin first.
- **Owned-area tickets.** Text-search open tickets for the owned components; unassigned epics there make good month-1 and month-3 tickets, each mapped to an interview gap.

## Shape rules

- **Make milestones ambitious and evidence-shaped** when the user asks for stretch: each with a demonstrable outcome (drill run, runbook re-verified, SLO + alert, ADR authored, scale number). Label them in the manager notes as motivation, not a performance benchmark, if the user says so.
- **Name the team's tools, not the user's personal setup.** Ask which tools are the team norm and check the repo for its config (e.g. a `.claude/` directory next to `AGENTS.md`).
- **Every handed-over ticket says "break it down before starting",** in the ticket body and the guide; splitting epics counts as part of the ramp. A planned area with no ticket becomes their breakdown exercise, flagged in the manager notes.
- Link to the repo's existing docs (README, CONTRIBUTING, AGENTS.md, runbooks, ADRs) rather than restating them.
