# Making a tracker board useful for standup / weekly

Order that worked; each step is a decision for the user, not an action.

1. **Pull the whole label/scope population** (not the board's current view) and bucket by status, assignee, priority, due date. Report the skew (e.g. one assignee holding most of a column) as the first finding; it often explains why the board feels useless.
2. **Read the project's roadmap/status docs** for existing phase, milestone and done definitions. Use them; retract any definition you invented. Done may legitimately differ per environment/phase, but only change the working definition when the user says the environment is ready.
3. **Prefer few mechanisms.** Surviving set is usually: a scope filter (single phase label), one "no due date" filter that makes the weekly meeting finished when empty, and assignee swimlanes. Overdue dates already show red on cards; cut stale/priority/mine filters, dashboards that duplicate a status doc. One assignee = whoever acts next; extra name fields do not help.
4. **Due date = date of the milestone the ticket serves**, set in bulk once the external gate (e.g. env-ready date) is confirmed. Dates hang off that gate, so ask for it before writing.
5. **Then revisit membership of the scope itself.** If the board still feels useless, test every ticket against "does this block a milestone's evidence?" Keep / move out (change phase label, drop the due date I set) / judgement call. Moving out closes nothing, so it is cheap to reverse. Surface the fairness side effect (a person's whole workload leaving the board) explicitly.
6. **Board config (quick filters, swimlanes, board filter query) is not writable via the connector**: give exact click steps and JQL.
