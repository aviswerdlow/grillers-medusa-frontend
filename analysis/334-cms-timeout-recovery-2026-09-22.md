# CMS timeout recovery — #334

Tracking: https://github.com/aviswerdlow/grillers-pride-strategy/issues/334

The transport defaults to 5 seconds; the store loader defaults to 8 seconds. Positive integer environment overrides remain available. A transport or loader timeout stops the legacy schema retry. Non-timeout schema errors retain compatibility fallback.

The store retains its last successful compacted catalogue per client and returns it when refresh fails. Public homepage/global/rail reads opt into remembered display responses; checkout and policy reads do not. Next Data Cache still supplies persistent caching and five-minute public-content revalidation. The additional remembered result is process-local: a new process without any successful response cannot manufacture a catalogue and renders an actionable retry state. Medusa still supplies prices and inventory. A successfully empty catalogue replaces the remembered result.

The homepage declares `maxDuration = 30`. Degradation alerts coalesce by stage for five minutes within each server process; the receiver remains responsible for distributed deduplication. Homepage alerts remain suppressed during production builds.

Validation: 33 focused tests across Strapi cache/collections, alert delivery, catalogue alert reporting and render decisions passed. `tsc --noEmit --incremental false` passed. Regression coverage includes a primary timeout returning the previously loaded catalogue with exactly one request, transport timeout without a legacy query, isolated clients, explicit opt-in for stale display data, the default transport deadline, and alert-window expiry. CI and preview evidence are linked from the issue; local tests do not establish preview acceptance.
