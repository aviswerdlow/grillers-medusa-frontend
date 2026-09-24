# Calendar deployment compatibility

Tracks [strategy #372](https://github.com/aviswerdlow/grillers-pride-strategy/issues/372) and [#362](https://github.com/aviswerdlow/grillers-pride-strategy/issues/362).

There is no storefront calendar activation flag. Backend `GP_CALENDAR_ENFORCEMENT=off|required` is authoritative and defaults to `off`. Backend PR 34 exposes its mode through an uncached GET on `/store/grillers/checkout/fulfillment-calendar`. Its POST continues to validate existing signed promises even with enforcement off.

## Deploying separately

| Backend response | Unsigned cart behavior |
| --- | --- |
| Current backend main: POST and GET both 404 | Existing customer scheduling and staff date entry remain available. |
| PR 34 with enforcement off: POST 503 or validation state `legacy`, GET `off` | Same existing scheduling. No published calendar, signing key or CMS calendar data is needed for this compatibility path. |
| Enforcement required | Shared calendar, explicit selection and pre-payment validation are required. Missing operating data or a calendar outage blocks the promise. |
| POST 503 with GET missing, failed or malformed | Block; an unknown outage is not evidence that enforcement is off. |
| Authorization failures, network errors or other failures | Block; no calendar downgrade. |

The calendar change can deploy before backend PR 34 against backend main `369fe76`. Conversely, backend PR 34 defaults off and retains the legacy completion path for the existing storefront. Existing stricter packing-policy gates in later backend candidates remain separate. The entire frontend stack remains held by #372's other cross-repository defects, including its inherited staff boundary; this calendar receipt is not permission to merge the stack.

## Keeping accepted promises

Fallback requires a fresh authorized cart read. A selection token, accepted promise or calendar quote ID prohibits fallback, even when malformed or when enforcement is off. Completed or missing carts also prohibit fallback. The browser invalidates displayed compatibility state when the cart's promise changes.

Saving an existing-style date and every pre-payment calendar check repeat the capability and cart checks. A page opened before activation cannot silently overwrite a subsequently signed promise or bypass required mode. Legacy writes do not clear signed promise fields. A valid signed validation permits payment, not legacy date editing.

Staff phone orders retain the authorized draft → date → payment sequence. Every legacy date write rechecks the original office actor and current access. Dated inventory exceptions require explicit staff review, then renew their receipts under the same authenticated actor. Inventory, customer verification, payment consent and calendar validation remain separate payment prerequisites. Native completion and completed-cart replay retain their existing checks.

## Verification and activation

Focused action/component tests cover the old backend, explicit off, required mode, authorization/errors, existing promises, activation while a form is open, and staff ownership/inventory checks. Browser component checks use synthetic actions and the real scheduling components at desktop and phone sizes; they do not prove provider or native cart behavior. Exact-head CI supplies the full unit/type/build gates.

Do not activate required mode until the approved CMS calendar, signer, route dates and paired runtime rehearsal are ready. Peter's #357/#358 inputs and the larger #362 acceptance criteria remain open. This frontend change has no schema migration and needs no database backup step of its own. No production flag, operating date, provider transaction or customer message is changed by this PR.
