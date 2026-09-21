# Browser measurement contract — launch #336

This extends frontend PR63 on PR62. It is a source candidate, not deployment or
permission to run the live rehearsal. Backend PR43 and analytics PR12 keep their
own release and migration prerequisites.

## Producer and destination contract

Every Jitsu page, track and identify call must read the current analytics choice
before creating identifiers or sending. Unknown/denied consent is not buffered
for later replay. A malformed or unwritable consent record cannot grant tracking.
The same event identity and explicit consent/test classification go to Jitsu,
first-party analytics and (production only) communications. Analytics consent is
not marketing permission; existing topic opt-in/suppression rules still apply.

Use the same resolved Stripe publishable key as checkout. A live key permits the
production analytics lane; a test key permits only an explicitly configured
rehearsal lane. Missing/mismatched/unknown configuration holds browser sends.
`NEXT_PUBLIC_ANALYTICS_ENVIRONMENT` defaults to `production`; `rehearsal` also
requires `NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID` (3–48 lowercase slug characters).
An event property cannot override the lane, consent, identity or event ID.

Production retains the existing Jitsu, communications and `/a` GP mirror.
Rehearsal requires dedicated HTTPS origins and different public ingestion keys:

- `NEXT_PUBLIC_REHEARSAL_JITSU_HOST` and `NEXT_PUBLIC_REHEARSAL_JITSU_WRITE_KEY`.
- `NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_ENDPOINT` and
  `NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_CLIENT_KEY`.

Each rehearsal target is checked against the configured production origins and
keys. Missing production comparison configuration or a shared origin/key holds
that target. No production fallback, `/a` rewrite, communications call, production
ops alert, or GTM call is permitted for rehearsal. Redirects are refused. Browser
delivery remains best effort; HTTP acceptance does not prove warehouse/report
delivery. Verify actual independent Jitsu/ClickHouse/GA4 destinations, scoped
keys and browser CORS before the controlled rehearsal.

The confirmation page must not emit a second GA4 purchase. Purchase, finalization,
refund and fulfillment facts remain server-owned. Email addresses are not valid
analytics user IDs. Canonical account ID, logout and guest continuity still need
their separate accepted integration and real browser evidence.

## Consent and GTM handoff

Cookie changes notify mounted tracking components; they read the saved choice,
not arbitrary event detail. Revocation stops new first-party calls. GTM helpers
and loading require the production lane and analytics consent. GTM also requires
explicit `NEXT_PUBLIC_GTM_CONSENT_READY=true` after its consent template has been
verified. The page publishes `window.gpConsentState` and `gp_consent_update` with
analytics/ad storage, ad user data and personalization choices before loading the
container and on later changes. Marketing choices control the ad categories.

The operator must configure a Consent Initialization template that reads this
state, uses `setDefaultConsentState` before tags run, and calls
`updateConsentState` on `gp_consent_update`; tags must require their corresponding
consent. Google recommends those GTM template APIs, not a queued gtag update:
https://developers.google.com/tag-platform/security/guides/consent
Removing a React component does not unload already loaded tags. Prove rejection,
grant, revocation and cross-tab refresh in Tag Assistant/network evidence before
enabling the ready flag. No live container/configuration change is part of this
source change.

## Remaining launch gates

- Backend generic cart/customer/shipping/inventory producers and communications
  ingress still need trusted classification/isolation; the purchase boundary
  does not cover them. Keep #332's live rehearsal stopped.
- Browser assignment/exposure history, identity on login/logout/account switch,
  campaign/checkout context and full consent UI remain #336 acceptance work.
- The standalone review-click redirect has a separate event producer. Verify its
  consent and original test provenance before including it in a live rehearsal.
- Original #335/#336/#332 acceptance and all dependency/operating gates remain.
