---
description: "Work through MR review threads: fix what holds, rebut what doesn't. Rebuttals are posted only on your go."
argument-hint: "[mr url — default: the current branch's MR]"
---

Target: **$ARGUMENTS** — default the open MR for the current branch (`glab mr view`).

1. Fetch unresolved discussion threads (`glab api` on the MR's discussions; drop resolved ones).
2. Work each thread against the actual diff:
   - **Holds** → fix the code; after push, reply in-thread citing the fixing commit.
   - **Doesn't hold** → draft a rebuttal: cite the code or evidence, short, no tone.
3. Fixes: commit per logical fix, push, watch the pipeline flip green.
4. Rebuttals: show every draft inline, grouped; post verbatim only on the user's yes.
5. Resolve a thread only after its fix is pushed. Never resolve a thread you rebutted — that call belongs to the reviewer.
