# Experiment versions at checkout

The paired backend contract is `docs/experiment-context-336.md` in
`mintpixels/grillers-medusa-admin`. This storefront candidate stacks on PR61;
backend stacks on PR41 and analytics on PR11. None is deployed by this change.

New active assignments carry an experiment revision derived from this code
release and registry definition, plus a distinct evaluation fingerprint. A
server-only HMAC binds both to the selected variant and assignment identity.
Both treatments share one experiment revision. Statsig's actual rule/group/value
is fingerprinted using the installed SDK; no remote revision is invented.

Verified sticky assignments retain their original evidence within a release.
Across a code release, a new receipt describes the currently rendered variant;
old cart lines retain their earlier receipt. Unsigned/tampered sticky values are
reevaluated on the server. A missing evidence key or release SHA leaves version
unknown without blocking shopping. Revenue guardrails and existing paused
experiments remain unchanged.

Cookies preserve the evidence. Browser exposures and downstream Jitsu context
carry versions without signatures; cart metadata includes the verification fields
and an explicit completeness marker. Missing/malformed/oversized/rejected storage
must remain unverified, never silently mean no experiment. The persistent
incomplete marker is not automatically cleared by a later smaller write; lost
history cannot be reconstructed by an unrelated success.

Before activation, the operator must approve/provision the dedicated server-only
`GP_EXPERIMENT_EVIDENCE_KEY_ID` and `GP_EXPERIMENT_EVIDENCE_KEYS` key ring, shared
only with the backend verifier, and verify `VERCEL_GIT_COMMIT_SHA` (or the approved
`GP_EXPERIMENT_RELEASE_SHA`). Never expose or reuse other credentials. Retain old
keys while existing carts/reviews can refer to them. No live key was read or set.

The synthetic fixture is identical to the backend vector. Focused tests exercise
assignment issuance, variant/version separation, sticky and invalid cookies,
browser/cart/exposure propagation, storage loss and missing configuration. The
operations guide now tells staff that missing/conflicting attribution cannot be
relabeled as no experiment or with today's version, and must not stop ordering.

Full browser/provider acceptance remains in #332/#336: actual views, simultaneous
experiment capacity, cookie-disabled/mobile cases, merged lines, later exposures,
guest-to-user/cart continuity, opt-out, test traffic and durable one-purchase
publication with separate finalization/refund. This source change is not that
receipt or permission to activate experiments.
