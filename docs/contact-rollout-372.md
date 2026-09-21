# Contact deployment compatibility — #372 / #365 / #366

The prior frontend called a contact endpoint absent from every open backend PR and made first-login confirmation impossible to skip. This change restores an account path without recording false verification and keeps ordinary profile phone edits compatible with an older backend.

## Independent deployment and defaults

No frontend contact flag is introduced. Backend primary-contact candidate is stacked on receipt-email PR37. `GP_PRIMARY_CONTACT_ENABLED` defaults off; only `true` activates the endpoint. An authenticated disabled request returns 404. Native Store profile writes remain compatible for unconfirmed accounts while off; confirmed primary state remains protected on rollback. Activation still requires the native Admin/staff/concurrent-write and consent/provider gates in #365. No runtime flag was changed here.

Against current backend main, only a 404 permits the phone-editor fallback to `updateCustomer`. A fresh customer read, absence of primary attestation and repeated non-staff context are required. Other failures (401/403/409/422/500/503/network), confirmed primary state and uncertain context refuse fallback. The fallback stores the actual displayed checkbox choice and destination-specific consent/opt-out fields. It does not create provenance, confirmation, a verified receipt or a fake revision. Existing order contacts remain unchanged; the success notice states that confirmation is still needed.

Do this later is a separate server action that requires the signed-in customer and refuses staff impersonation. It sets an HTTP-only, same-site browser-session cookie derived from the current customer, confirmation version and a hash of the current authentication context. The raw token is never stored. The account route checks that marker before redirecting, so missing contact APIs do not create a redirect loop. A new login/customer cannot reuse the deferral. No Medusa customer update, consent, address or receipt mutation occurs on skip. The account displays a link to resume confirmation.

## Verification and limits

26 focused contact/provenance/action/component/routing tests passed. The account-route regression proves a deferred customer reaches the account; a new unconfirmed session still gets the prompt. Frontend TypeScript initially found the success-state notice missing from the action's inferred initial-state union; the explicit action return type corrected it and the targeted type retry passed. Existing negative fallback, phone-integrity and non-staff assertions remain intact. Use exact-head CI for the full unit/type/Next build gates, including the updated operations guide.

This is source compatibility, not a live customer migration or provider receipt. Backend POST confirmation, receipt-email verification, legacy delta reconciliation, all Admin/staff/native write races and separate order/marketing-text behavior still need their original acceptance. Keep #365/#366 and #372 open, preserve the stopped #345 consumer-form fixture, and do not activate contact confirmation on source CI alone. No customer, provider message, production data or configuration was changed.
