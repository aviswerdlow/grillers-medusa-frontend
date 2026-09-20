# Checkout review candidate — #368

Tracking: https://github.com/aviswerdlow/grillers-pride-strategy/issues/368. Release with backend PR40's reviewed-checkout adapter and immutable ledger. This source candidate is not production activation or full issue acceptance.

The active payment screen uses `CheckoutOrderReview`, not the unused legacy review component. The server provides the exact lines, price basis, addresses, date/service/window, verified receipt destination, approved terms and total. Edit links use the existing cart/address/delivery/profile paths. Loading, changed cart identity, expired reviews and late responses cannot enable placement. Submitted values are review/request identifiers and consent, never a customer-authored order promise.

Saved/new card checkout validates the review before Stripe setup and carries the identifiers into the existing final-charge placement action. It retains a successful setup reference on retry. Approved invoice checkout uses the same review and the actual account terms. The review shows all three canonical legal links; the backend archives published Terms of Sale and the exact payment consent separately.

Staff phone collection verifies inventory and accepts the current review before confirming the existing Stripe payment. Once Stripe reports success/authorized capture, a retry repeats only order confirmation. Catch-weight lines are blocked for immediate collection; use existing customer final-charge checkout or the checkout-link flow. No new invoice/default payment policy is introduced.

Customer error recovery requests the status of the same cart with the original review/request identifiers. The backend refuses recovery unless that cart is already completed. A status error must not be treated as proof of failed payment or permission to create a new order. Reload persistence, native payment/subscriber recovery and actual stock behavior still require #332 acceptance.

Prerequisite source: this branch starts from homepage PR59's calendar/incoming/staff chain and explicitly merges receipt PR56 and shipping PR55. The backend counterpart composes receipt PR37 and incoming/staff PR38. Do not deploy just one side; the new backend refuses unreviewed completion. #368 hard dependencies remain #314, #318, #320, #329, #331, #359, #362, #364 and #366. #365 remains an unfinished primary-contact handoff.

The staff operations guide documents the candidate review, recovery and catch-weight restrictions. Staff amendments await Peter's #359 whitelist/cutoff/approval policy; QBD amendments and original-event consumers remain separate work. Original acceptance is never rewritten by an account/profile change.

Validation: focused component/action units and TypeScript, followed by exact-head CI (Jest, TypeScript, Next build). Desktop 1280px and mobile 390px screenshots render the actual component with synthetic server data; the 390px content width is 390px. That inspection excludes the full Next checkout, native Medusa, Stripe, production fonts and provider effects. Save the exact CI and screenshot receipts in strategy #368 before integration. No production/customer/order or message was created by the preview.
