# Grilling an inventory / research ask (e.g. "find out the dependencies of X")

The ask produces a document, not code. Do the facts first, then grill only the decisions.

## Order of attack

1. **Static pass before round 1.** Search the repo for the existing fragments (config env files, deploy manifests, network policies, ADRs, runbooks) and say up front that no single SSOT exists. Open round 1 with what was found, not with questions.
2. **Mark every row's confidence**: "confirmed in config" (cite file) vs "inferred". Gaps stay visible as gaps; never fill them with plausible guesses.
3. **Round 1 decisions** (all recommended, one line each): does it deserve to exist / where it lives (fold into an existing doc, no new file); the purpose (e.g. new-environment checklist vs audit vs leadership summary); the baseline environment; static-only vs live checks (live needs the user's yes for cluster access); scope boundary between the two sides being inventoried (put in-between components such as proxies or hosted control-plane pods on the side where reachability questions land).
4. **Round 2** is only what the answers opened: doc home, how to write environment-specific values (role-based rows with an example value and a blank "prod value" column beats hard-coded test IPs), whether to trace a found gap statically now, and whether unresolved placeholders get a short "must set" list.

## Where to look for network/dependency facts in a deploy repo

- Per-overlay runtime/config env files: grep keys ending `_ENDPOINT`, `_URL`, `_ADDR`, `_KUBECONFIG`, `_DSN`.
- NetworkPolicy manifests and their header comments (they record why a port is open and what the policy cannot restrict, e.g. NodePort traffic arrives SNAT'd so a security-group rule is the real control).
- Gateway/route manifests for listener ports and SNI hostnames.
- Placeholder CIDRs (`0.0.0.0/32`) in shared policy components: before listing one as "must set", grep the overlays to see whether anything adopts the component and whether CI already rejects an unpatched render. An unadopted or CI-guarded placeholder is not a silent failure, so retract it. What belongs in "must set" is a control no manifest can enforce (e.g. a security group on a NodePort).
- ADRs for tenant-side egress (which registries the tenant network can reach).
- Image and chart sources in addon profiles for public-registry egress.

## Delivering the doc

- When the user says "yes" to writing it, work in a git worktree on a new branch cut from a freshly fetched `origin/<default>` (the main checkout is usually behind and on the protected branch). Commit locally only; push/MR waits for an explicit ask.
- If the repo's `make doc-check` times out in the tool, run the script it wraps (`sh hack/verify-docs.sh`) directly. `timeout` is not available on macOS.
- Open the result in the user's editor on request (`code <worktree dir>`).
- **Home doc must match the doc's topic, not just "an existing doc".** Folding into an adjacent-sounding doc (e.g. a bind-ports/storage-planes doc for a firewall checklist) gets rejected as off-topic. Check the candidate's scope first; if the content is a different kind of fact, make a new file in the same folder, add one line to that folder's README index, and say so. "Fold into existing" is the default only when the topic fits.
- **The user edits the file in their editor while you wait.** Before rebase/push, run `git status`: unstaged edits block `git rebase`. Treat them as intended, commit them (separate commit), then fetch + rebase onto the default branch and push.
- Use Python, not `sed -i`, for inserting a line into a file (BSD sed on macOS rejects the GNU one-liner).
- Push/merge flow when the user says "commit, push and merge": fetch and rebase first (the pre-push hook only checks behind-default), push, `glab mr create --target-branch <default> --remove-source-branch --yes` from inside the worktree, then poll the pipeline at <=30s intervals and merge on green. Keep each poll call short (a few iterations per call): a long loop can hit the approval timeout and never run.
- When the user asks "what is this for?" about a proposed section, answer in one plain sentence plus the verdict per item (keep/retract) with the evidence; do not defend it.

## Pitfall

Keep the table split by workload side and give each row direction, port, purpose, and source file, so the doc can be re-checked against code rather than drifting.
