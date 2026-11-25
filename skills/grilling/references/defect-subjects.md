# Reported-defect subjects ("is this a bug?", "X stopped working")

The existence question is about the change the finding would produce, not about the user's symptom.

## Reproduce and separate the layers

- Reproduce against the live system first. Separate the layers: is the thing reachable at all, and is the credential/input separately rejected?
- Decode the artifact itself rather than inferring from config — a bearer token's own `exp`/`iat`, a cert's `notAfter`, a file's embedded timestamp — then confirm the configured value in code is what produced it.
- A symptom fully explained by designed behavior kills the "it broke" framing but does not end the session: the reproduction usually surfaces real adjacent defects (a contract that declares a field it never defines, an artifact that carries no expiry on its face, a shipped surface no open ticket owns). Those are what the existence verdict is about. Say plainly which layer is working as designed before proposing anything.

## Choosing probes

- Skip a live probe whose two possible outcomes produce the same diagnosis — if a revoked and an expired credential yield the identical rejection, reaching further into a privileged system is not worth the access. Re-price the skip when a later round raises a *different* question: the same privileged read is often decisive for "did the retry actually mint anything", because its state carries per-action timestamps.
- Shred any credential a probe put on local disk once the question is answered, and say that you did.
- A probe that tests whether a guard blocks something needs a **control** known to be blocked, run first in the same scope. If the control is allowed too, the probe cannot tell "the guard does not cover X" from "the guard is not running here": report that gap, move to a scope where the control is refused, and draw no conclusion until then.
- In a security finding, check the *premise sentence* ("the tenant is denied X") against the guard's actual match rules, not only the sink line — the sink is usually accurate and the premise is usually where the finding is wrong.
