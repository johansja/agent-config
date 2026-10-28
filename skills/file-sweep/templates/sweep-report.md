# Sweep report — <date> <HH:MM–HH:MM> <TZ>

Copy this block, fill it, delete rows that do not apply. One labelled line per fact; no prose.

```
scope    <targets scanned, absolute paths>
batch    attempted N · moved N · failed N · excluded N (<names> — <rule that excluded them>)
tests    N probe moves (HH:MM, HH:MM) · total N — counted separately from the batch
verify   <command> → <what it returned>; N of M spot-checked (<why the rest cannot be read>)
log      <path> · +N lines today (N total, append-only)
prior    <HH:MM run>: N MOVE, N TRASH, N staged — re-verified | not re-verified
sync     provider-backed: trash propagates to all devices, 30-day Recently Deleted;
         no Finder Put Back (raw rename) — undo log is the only recovery path
open     <what was left behind, and the rule that left it>
```

## The failure this replaces

```
Not:  44 processed in the batch, 0 failures, plus the 2 test moves — 46/46 in the Trash
But:  44 attempted · 44 moved · 0 failed · 2 excluded (.DS_Store, .localized — rule)
      + 2 probe moves (13:04, 13:10), counted separately · total 46
```

Why: the first version has three denominators in one clause and one verification method
("Finder") for a claim about 46 objects. A reader cannot tell what `0` is out of, whether
the probes are inside the 46/46, or what was actually checked.

## Rules the block encodes

- A ratio needs one denominator; if the set changes, print a new line.
- Verification is a method plus its coverage, never a verdict alone.
- Anything carried over from an earlier run is labelled with that run's time and marked
  re-verified or not.
- The log line count is the accounting identity: if the bullets do not sum to it, the
  difference is an unnamed category, not a rounding error.
