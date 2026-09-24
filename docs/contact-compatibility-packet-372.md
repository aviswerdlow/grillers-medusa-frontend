# Contact compatibility

Default behavior change: the SMS marketing form submits the authenticated primary-contact transaction with the displayed revision and a stable request ID. Only a 404 for an unattested account permits a legacy update, which sends just new consent fields and never replays staff authority, credit or notes. Existing carrier-STOP and customer-only checks remain.

Default behavior change: phone and migrated-contact editors display the current subscription for the same mobile number. Changing the number clears the checkbox. Unavailable status is not treated as an opt-out for an unchanged number. New subscriptions still require the customer's optional affirmative choice.

Default behavior change: a 404 from the contact-confirmation submit offers the existing deferral without an operations alert. Address failures and unexpected endpoint failures retain their alerts. No confirmation or consent is manufactured by deferral.

Focused action and component tests cover successful new endpoint use, narrow 404 fallback, no authority replay, non-404 rejection, prior-contact rollback protection, current subscription display, changed numbers and targeted alert suppression.
