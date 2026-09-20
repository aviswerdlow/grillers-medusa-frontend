import LocalizedClientLink from "@modules/common/components/localized-client-link"

type GuideSection = {
  id: string
  eyebrow: string
  title: string
  summary: string
  useFor: string[]
  howTo: string[]
  watch: string[]
}

type Playbook = {
  title: string
  steps: string[]
}

const systemMap = [
  {
    name: "Storefront",
    owner: "What customers and staff use in the browser",
    details:
      "The storefront shows products, takes carts through checkout, lets customers manage accounts, and gives staff the phone-order and order-support tools.",
  },
  {
    name: "Medusa",
    owner: "Commerce engine",
    details:
      "Medusa owns products, variants, carts, customers, orders, shipping, payment state, inventory quantities, saved cards, and the staff order actions.",
  },
  {
    name: "Strapi",
    owner: "Content and customer-facing catalog detail",
    details:
      "Strapi owns product copy, PDP images, page content, recipes, collections, checkout copy, shipping settings, waitlist settings, experiment content drafts, and customer-safe product names.",
  },
  {
    name: "Statsig and Jitsu",
    owner: "Experiment assignment and first-party measurement",
    details:
      "Statsig assigns storefront experiment variants. Jitsu receives exposure, shopping, checkout, and revenue events so winners are judged from first-party behavior, not GA4 alone.",
  },
  {
    name: "Stripe",
    owner: "Saved cards, final charges, and refunds",
    details:
      "Stripe stores saved cards, runs the final pre-shipment catch-weight charge, and handles card refunds. Stripe should not see a catch-weight order amount until staff finalize the weighed order.",
  },
  {
    name: "Postmark",
    owner: "Email delivery",
    details:
      "Postmark sends order, cancellation, refund, shipped, welcome, password reset, back-in-stock, review, lifecycle, campaign, and staff phone-order emails.",
  },
  {
    name: "QuickBooks Desktop",
    owner: "Accounting and the operating item list",
    details:
      "QuickBooks receives sales orders, order-backed customer records, and accounting follow-up through the sync service and Web Connector. Product matching must use ListID, also called the item hex.",
  },
]

const dailyChecklist = [
  "Open the staff console and confirm you can see Order Support without being redirected.",
  "Check QuickBooks Web Connector. A green bar means the session ran; still open Last Result or the log if the status says it sent an error back to the application.",
  "Open Synchronization Status when Peter cannot find a website order in QuickBooks. It shows waiting rows, stuck rows, recent Web Connector activity, and the recorded failure reason.",
  "Open Pack & Finalize first. Every submitted launch order should appear there before it can ship.",
  "Use Order Support as lookup, not as a second fulfillment queue, especially for customer questions, refunds, cancellations, QBD failed, or QBD pending/manual orders.",
  "Open Customer Communications when checking campaign drafts, lifecycle flow health, customer timelines, suppressions, or Postmark delivery status.",
  "Place a small test order only when needed, using Stripe test cards while the site is still in test mode.",
  "Check that order, cancellation, refund, and back-in-stock emails are being received and that product names, PDP links, and pricing basis details are customer-safe.",
  "Before changing product availability, decide whether the item is out of stock, seasonal inactive, discontinued, or internal only. Those mean different things to customers.",
  "For any money action, verify three places separately: Medusa order/payment state, Stripe payment/refund state, and QuickBooks posting state.",
  "Before activating an experiment, confirm the experiment is approved, revenue gates are healthy if it affects shopping revenue, and the control still matches the current production experience.",
]

const publicSurfaces = [
  {
    route: "/us",
    name: "Homepage",
    staffUse:
      "Start here when explaining the site to a customer. Get Cooking opens the recipe hub, Storage & thawing opens the delivery and thawing guide, and See all deadlines opens the holiday ordering page.",
  },
  {
    route: "/us/store",
    name: "Full catalog",
    staffUse:
      "Use for broad product browsing, filtering, sorting, and finding all published storefront products.",
  },
  {
    route: "/us/search",
    name: "Search",
    staffUse:
      "Use when a customer gives a product name, SKU, or partial phrase. It should show customer-safe Strapi/Medusa titles.",
  },
  {
    route: "/us/collections",
    name: "Collections hub",
    staffUse:
      "Use for curated shopping paths such as first order, freezer stocking, local delivery, shipping, holidays, and other missions.",
  },
  {
    route: "/us/collections/[handle]",
    name: "Collection page",
    staffUse:
      "Use for a specific curated collection, Strapi product collection, or tag-driven product set.",
  },
  {
    route: "/us/products/[handle]",
    name: "Product page",
    staffUse:
      "Use to confirm product title, images, price, packaging, ingredient disclosure, kosher facts, shipping eligibility, waitlist availability, and add-to-cart behavior.",
  },
  {
    route: "/us/cart",
    name: "Cart",
    staffUse:
      "Use to review line items, quantities, delivery ZIP context, free-shipping progress, and cart-level inventory issues.",
  },
  {
    route: "/us/checkout",
    name: "Checkout",
    staffUse:
      "Use to choose fulfillment, schedule pickup or delivery, enter address, resolve inventory blocks, and save a Stripe card for final catch-weight charging.",
  },
  {
    route: "/us/order/[id]/confirmed",
    name: "Order confirmation",
    staffUse:
      "Use to verify customer-facing order summary, fulfillment details, items, contact/address, payment, and account creation prompts.",
  },
  {
    route: "/us/account",
    name: "Account overview",
    staffUse:
      "Use to confirm customer profile, recent current orders, and imported legacy QuickBooks order history.",
  },
  {
    route: "/us/account/orders",
    name: "Customer orders",
    staffUse:
      "Use to help a customer find current order history and order detail pages.",
  },
  {
    route: "/us/account/reorder",
    name: "Reorder",
    staffUse:
      "Use to rebuild a cart from Medusa purchase history and imported QuickBooks history where the item has a catalog match.",
  },
  {
    route: "/us/account/wishlist",
    name: "Wishlist",
    staffUse:
      "Use to help a customer save and revisit products. Product names should be Strapi customer-safe titles.",
  },
  {
    route: "/us/account/payment-methods",
    name: "Saved cards",
    staffUse:
      "Use to help a customer review, add, delete, or choose default saved Stripe cards.",
  },
  {
    route: "/us/account/staff/orders",
    name: "Staff console",
    staffUse:
      "Use for customer context, customer account actions, new customer creation, phone orders, Pack & Finalize, order support, Synchronization Status, refunds, cancellations, QBD retry, and team access.",
  },
  {
    route: "/us/account/staff/communications",
    name: "Customer communications",
    staffUse:
      "Use for customer timelines, direct staff notes, lifecycle flows, campaign drafts, audience segments, suppressions, and Postmark delivery status.",
  },
  {
    route: "/us/account/staff/merchandising",
    name: "Product image review",
    staffUse:
      "Use to review Strapi product images by category, read the latest rejection comment, reserve open work, and deliberately change a prior decision without losing its audit history.",
  },
  {
    route: "/us/account/staff/operations-guide",
    name: "This guide",
    staffUse: "Use as the staff operating manual and training link.",
  },
  {
    route: "/us/customer-service",
    name: "Customer service",
    staffUse:
      "Use for phone, email, hours, FAQ, policies, and support language managed in Strapi.",
  },
  {
    route: "/us/shipping/[slug]",
    name: "Shipping pages",
    staffUse:
      "Use for UPS, Southeast pickup, Atlanta delivery, plant pickup, and pallet-program explanations.",
  },
  {
    route: "/us/kashruth/[slug]",
    name: "Kashruth pages",
    staffUse: "Use for Passover, hechsherim, and supervision explanations.",
  },
  {
    route: "/us/holidays/order-deadlines",
    name: "Holiday deadlines",
    staffUse: "Use for seasonal cutoff and holiday ordering guidance.",
  },
  {
    route: "/us/page/[slug]",
    name: "Info and legal pages",
    staffUse:
      "Use for content-managed pages such as about, mission, legal, comparison, and policy content.",
  },
  {
    route: "/us/page/order-sms-terms",
    name: "Order text terms",
    staffUse:
      "Use when a customer asks what the optional UPS shipping and tracking text program covers, including message limits and STOP or HELP instructions.",
  },
  {
    route: "/us/page/order-sms-privacy",
    name: "Order text privacy",
    staffUse:
      "Use when a customer asks how the phone number and order-text consent are used for UPS shipping and tracking updates.",
  },
  {
    route: "/us/recipes",
    name: "Recipe hub",
    staffUse:
      "Use for recipe discovery, filters, holiday buckets, and product-related cooking guidance.",
  },
  {
    route: "/us/learn",
    name: "Butcher guide",
    staffUse:
      "Use for education content, cut guidance, kashruth education, and buying advice.",
  },
  {
    route: "/us/email-preferences",
    name: "Email preferences",
    staffUse:
      "Use when a customer wants to manage or unsubscribe from marketing email preferences.",
  },
  {
    route: "/us/navigation",
    name: "Site navigation",
    staffUse: "Use as a fast staff index of product and collection URLs.",
  },
  {
    route: "/agentic-commerce/*",
    name: "Agentic commerce feed",
    staffUse:
      "Used by automated shopping surfaces. Staff usually do not operate it, but should know it is a public product feed.",
  },
]

const sections: GuideSection[] = [
  {
    id: "customer-site",
    eyebrow: "Customer site",
    title: "What customers can do on the site",
    summary:
      "The customer site is the normal shopping experience. Staff should understand it because the staff console can enter a customer's account and use the same flow.",
    useFor: [
      "Browsing the homepage, store, search, collections, recipes, butcher guide, shipping pages, kashruth pages, legal pages, customer service, and site navigation.",
      "Viewing product pages with Strapi product titles, photos, ingredient disclosures, kosher status, shipping eligibility, and waitlist options.",
      "Adding products to cart, choosing fulfillment, paying by card, and receiving confirmation emails.",
      "Letting customers sign in, save addresses, manage saved cards, use wishlist, reorder from current or legacy history, and view order details.",
    ],
    howTo: [
      "Use /us/store for the full catalog. It is powered directly by Strapi product records so customer-safe names, descriptions, images, and merchandising stay current.",
      "Use /us/search when a customer is looking for a product by name or SKU. Search is live and should surface customer-safe titles.",
      "Use /us/collections for curated shopping paths. Individual collection pages may be Strapi product collections, product tags, or curated collections.",
      "Use a product page when confirming exact packaging, price mode, ingredient disclosure, kosher status, shipping eligibility, and whether a waitlist is offered.",
      "On desktop, click a main navigation label to open its menu. Moving the pointer across the navigation does not open a menu; click the same label again, click outside, or press Escape to close it.",
      "In the cart, each line shows its customer-safe SKU, quantity, and discount-aware extended Total so a customer can adjust quantities against a budget. Larger screens also show the per-pack Price in its own column.",
      "Use /us/navigation as a plain index of products and collections when staff need a fast reference page.",
    ],
    watch: [
      "Do not promise a product fact unless it appears in Strapi, Medusa, or current staff guidance.",
      "If a page shows a QuickBooks accounting title to customers, treat that as a bug. Customer-facing names should come from Strapi or Medusa.",
      "For catch-weight items, the cart line Total is still an estimate until staff record the actual weight. Do not promise it as the final charge.",
      "If a product is intentionally inactive, customers should not see a normal back-in-stock promise for it.",
    ],
  },
  {
    id: "merchandising-review",
    eyebrow: "Merchandising",
    title: "Reviewing product images",
    summary:
      "The product image workspace records staff approvals, rejections, comments, reservations, and review changes in Strapi against the media record. Prior decisions remain available as an audit trail.",
    useFor: [
      "Working through product image categories in alphabetical order.",
      "Approving a customer-safe product image or rejecting one that needs replacement.",
      "Reading the latest rejection reason and comment, including after a later approval.",
      "Correcting a prior approval or rejection while preserving who made the earlier decision and when.",
    ],
    howTo: [
      "Open Product image review from the staff console. Categories start in A–Z order; use search to find a category or parent group. Your search and chosen sort stay available when you open a category and return during the same browser session.",
      "Open a category, then review each image card. The card shows the current decision and the latest rejection note when one exists. Open the image or View audit history for the full-size image and every recorded action.",
      "For an unreviewed image, choose Approve or Reject. A rejection needs a reason; add a clear note telling the replacement team what is wrong.",
      "Reserve while reviewing only when you need to signal temporary ownership. A reservation is optional and does not count as a completed review.",
      "For a reviewed image, choose Change review. Select the new decision, update the note or rejection reason, continue to confirmation, and compare the current and new decisions before confirming.",
      "After a review change, verify the card shows the new current decision and open Audit history to confirm the earlier decision and comment remain recorded.",
    ],
    watch: [
      "Change review makes a new decision current; it does not delete or edit the prior audit entry.",
      "A latest rejection note can describe an earlier decision even when the current decision is Approved. Read the current decision and the note label separately.",
      "Do not override an image reserved by another staff member. Coordinate with that reviewer or wait for the reservation to be released or expire.",
      "Approval changes review state only. Replacing the actual product image is a separate Strapi media task.",
      "Image review data is associated with the Strapi media record. If the same media is reused, its review history follows that image.",
    ],
  },
  {
    id: "catalog",
    eyebrow: "Catalog",
    title: "Products, names, SKUs, and QuickBooks ListIDs",
    summary:
      "The product title a customer sees is not the same thing as the QuickBooks item name. Staff should use customer-safe product names in customer conversations and use QuickBooks ListID only for operations.",
    useFor: [
      "Understanding why the same physical product may have a changed QuickBooks SKU or item name.",
      "Avoiding customer emails that expose seasonal QuickBooks prefixes, raw accounting names, or internal production names.",
      "Knowing what to backfill or check when a product fails to post to QuickBooks.",
    ],
    howTo: [
      "Use Strapi product Title and Medusa product title for customer wording.",
      "Use SKU as customer-safe subtext where it helps staff or customers confirm the item.",
      "Use QuickBooks ListID, also called the item hex or item name id, as the stable accounting identity.",
      "When QuickBooks SKUs change for seasonal sorting, do not remap by SKU first. Confirm the ListID.",
      "For item Hechshers, use the five exact Strapi fields sourced from Peter's Item Manager categories by QuickBooks ListID: OU, Chassidish Recognized, CHK Certification, AgriStar Lamed-K Lubavitch or Rabbi Weissmandl, and AgriStar Lamed-K Lubavitch.",
      "Keep item Hechshers separate from other kashruth facts such as Chassidish shchita and Kosher for Passover. One does not imply the other.",
      "Items beginning with RM- and items marked internal only are production inputs. They cannot be sold through the public catalog or staff cart. Keep their QuickBooks records and stable item identities; correct an incorrect classification through catalog review before attempting a sale.",
    ],
    watch: [
      "A matching SKU can be misleading during Passover or other seasonal list management.",
      "A missing ListID on a product or variant can block QuickBooks posting.",
      "If a Hechsher badge is wrong, correct the item-level source mapping; do not infer certification from a product title or description.",
      "ListID is operational data. Do not show it to customers in storefront UI or emails.",
    ],
  },
  {
    id: "checkout",
    eyebrow: "Checkout",
    title: "Cart, fulfillment, and payment",
    summary:
      "Checkout is a single flow where the customer chooses fulfillment, confirms address and schedule, resolves inventory issues, and saves a Stripe card for the final weighed charge.",
    useFor: [
      "Plant pickup orders.",
      "Atlanta delivery orders.",
      "Southeast pickup orders.",
      "Tennessee route pickup and Dallas consolidated shipping orders.",
      "UPS shipping orders.",
      "Customer checkout links prepared by staff.",
      "Inventory blocks that require a replacement, waitlist, quantity change, or date change before payment.",
    ],
    howTo: [
      "Start from the cart and continue to /us/checkout. The old fulfillment-only checkout route redirects into the unified checkout.",
      "Confirm the fulfillment type first. This affects dates, addresses, shipping method, thresholds, and inventory availability.",
      "A Tennessee shipping address unlocks every active Tennessee route stop, including Memphis and Nashville. A Texas shipping address unlocks Dallas Consolidated Shipping. The customer still chooses the exact stop and one of its published dates.",
      "If the customer changes the shipping address, checkout clears address-dependent delivery or UPS selections and asks for a valid method again. Plant pickup can remain selected because it is not tied to the customer's ZIP.",
      "Use the inventory notice before payment. Customers may substitute an item, remove it, join the waitlist, move the order date, or complete only the available quantity.",
      "For UPS shipping, the payment step shows a separate unchecked shipping and tracking text box. It is optional, covers one enrollment confirmation plus later UPS shipping or tracking updates up to six total messages for that order, and is separate from marketing-text consent.",
      "Stripe is the card processor. During test mode, use Stripe test cards only.",
      "After checkout, the customer sees the order confirmation page and should receive a confirmation email. For catch-weight orders, this is not the revenue charge.",
    ],
    watch: [
      "Wallet messaging should not be promised unless the backend supports it.",
      "Only the customer may check the order-text box. Staff cannot grant this consent while acting for the customer or taking a phone order.",
      "Inventory can change between cart building and checkout. Product eligibility is checked before payment setup and again before order completion. If availability cannot be verified, wait and retry; do not work around the check by entering a different item identity.",
      "Catch-weight checkout saves the card but does not authorize or charge the estimate. Staff charge the final amount in Pack & Finalize before shipment.",
      "QuickBooks should receive an estimated sales order after checkout. A successful final Stripe charge should then queue the finalized QuickBooks invoice.",
    ],
  },
  {
    id: "b2b-invoice",
    eyebrow: "B2B invoice",
    title: "Pay by invoice for approved business accounts",
    summary:
      "Approved business accounts can pay by invoice on Net terms instead of a card. The business applies online, an approver approves the account, and from then on that account sees a Pay by invoice option at checkout. The order ships and the unpaid invoice ages in the QuickBooks accounts receivable. No card is held for these accounts.",
    useFor: [
      "A synagogue, school, caterer, or other business that buys regularly and should be invoiced instead of paying by card every time.",
      "Reviewing and approving, or declining, a business that applied for invoice terms.",
      "Explaining why an approved account sees a Pay by invoice choice at checkout and a regular customer does not.",
    ],
    howTo: [
      "A business applies from Account, then Invoice terms. They enter business name, tax ID, contact details, a requested credit limit, and preferred methods of Zelle, check, or wire.",
      "The application appears on that customer's page in Medusa Admin under Pay by invoice (B2B) with an Application pending badge and the submitted business details.",
      "Only the designated approvers can approve. Approving sets the accepted methods, the credit limit, and the QuickBooks terms, which default to Net 10, and flips the badge to Approved. Decline records the decision without setting terms.",
      "The source of truth for who may pay by invoice is moving into QuickBooks. Peter flags the account and sets its credit limit on the QuickBooks customer record, and the website reads that. Until that sync is wired, the approval set in Medusa Admin is what gates checkout.",
      "Once approved, that customer sees a How would you like to pay choice at checkout with Pay with card and Pay by invoice. Choosing invoice places the order with no card and no final-charge card hold.",
      "The order still goes through Pack and Finalize for picking and weighing. The final weighed total is invoiced, not charged to a card.",
      "If checkout holds an invoice order because its projected exposure exceeds the saved credit limit, the approval pager shows an Approve & release action. Only a Slack user listed as a designated credit approver can clear that credit hold; everyone else receives a private denial and the order stays held.",
    ],
    watch: [
      "Only approved accounts can pay by invoice. A regular customer never sees the option, and the checkout backend rejects an invoice attempt from a non-approved account.",
      "There is no card on file for invoice accounts by design. Do not ask an invoice customer for a card as a backup.",
      "Approving an account is a credit decision. Confirm the business and the credit limit before approving, and keep the limit and terms matched to what Peter set in QuickBooks.",
      "The credit-review card's exposure is currently the website's invoice-order snapshot, not a live authoritative QuickBooks open-A/R balance. Confirm the customer's current QuickBooks receivables before granting the second approval.",
      "The unpaid invoice sits in the QuickBooks accounts receivable and is collected by Zelle, check, or wire on the account's terms. Collection is manual in QuickBooks for now.",
      "Approvals and declines are audited to the staff member who made them.",
    ],
  },
  {
    id: "order-lifecycle",
    eyebrow: "Order lifecycle",
    title: "From checkout to QuickBooks, Stripe, and fulfillment",
    summary:
      "A catch-weight order moves through several systems. Medusa is the order and workflow record, Stripe only sees the final charge when staff release the order, and QuickBooks receives accounting documents through the sync service and Web Connector.",
    useFor: [
      "Tracing a customer order from the moment checkout succeeds.",
      "Explaining why QuickBooks should show an estimated sales order before the card is charged.",
      "Separating saved-card setup, final Stripe charge, QuickBooks sales order, QuickBooks invoice, and fulfillment.",
      "Diagnosing whether a missing order is a Medusa issue, QuickBooks sync issue, Stripe issue, or Web Connector timing issue.",
      "Training staff on when an order can and cannot leave the building.",
    ],
    howTo: [
      "Customer or staff acting in customer context completes checkout. The site saves the card for a later final charge and checks inventory before completing the cart.",
      "Stripe stores or verifies the saved card. For catch-weight checkout, Stripe does not receive the estimated order amount and does not authorize or charge the card at this point.",
      "Medusa creates the order, records the saved-card workflow, blocks fulfillment, and creates the catch-weight finalization record.",
      "Medusa sends the order confirmation email and records order, inventory, analytics, communications, and QuickBooks sync events from the order.placed event.",
      "The QuickBooks sync service imports the placed order from Medusa. This creates or updates the sync service's order record and prepares it for QuickBooks Desktop.",
      "QuickBooks Desktop receives the estimated Sales Order only after Web Connector runs the order-send step and QuickBooks accepts the request.",
      "The picker claims the pick, enters picked quantities, records out-of-stock lines, substitutions, removals, or added mapped items, then marks the order Ready For Packing.",
      "The packer claims the pack, confirms packed counts, enters one actual weight for each by-weight pack, records container rows, dry ice, and packed pounds, then marks the order Ready For Charge.",
      "Front office reviews the final total. If anything is wrong, send the order back to Picking or Packing. If the order is correct and ready to leave, click Charge Card & Release from an account with final-charge permission.",
      "Stripe receives the final weighed amount only at Charge Card & Release. If the charge succeeds, Medusa releases fulfillment and queues the final QuickBooks posting. If the charge fails, hold the order and do not ship.",
      "QuickBooks Desktop receives the finalized Invoice only after Web Connector runs the staff-action writer step and QuickBooks accepts the invoice request. The invoice uses Peter's Custom S.O Invoice layout, keeps the QuickBooks Sales Order number, and prints the final customer, fulfillment, package, and instruction details.",
      "For a card order, the next QuickBooks writer step applies the Stripe payment specifically to that new Invoice. After QuickBooks accepts it, the Invoice should show the payment, a zero balance, and Paid status. A pay-by-invoice order deliberately skips this payment step and remains open in accounts receivable.",
      "After the successful charge and physical handoff or shipment, staff mark the order fulfilled in Medusa and then verify QuickBooks posting status after the next Web Connector run.",
    ],
    watch: [
      "A Medusa order can exist before Stripe has charged money. Do not treat the checkout estimate as collected revenue.",
      "A saved card in Stripe is not the final charge. The final amount is created only from Pack & Finalize at Charge Card & Release.",
      "QuickBooks Sales Order posting depends on Web Connector, a mapped customer, valid addresses, QBD ListIDs on line items, and required shipping, discount, and tax item configuration.",
      "QuickBooks Invoice posting depends on successful final Stripe charge, final weights or quantities, mapped QBD items, Peter's configured invoice template, and later Web Connector writer runs for the Invoice and its applied card payment.",
      "If an order is canceled before QuickBooks receives the Sales Order, the sync can skip QuickBooks posting. If it is canceled after QuickBooks posting, the sync should queue a sales-order close task.",
      "Green Web Connector progress bars mean the session completed. They do not prove that a specific Sales Order or Invoice posted successfully.",
      "Stripe success does not by itself make the QuickBooks Invoice paid. For card orders, verify both the Invoice writer job and its invoice-specific Receive Payment job before expecting a zero QuickBooks balance.",
      "Existing test orders from before the immediate Sales Order sync change may need a replay or manual re-import before they appear in QuickBooks as Sales Orders.",
    ],
  },
  {
    id: "staff-console",
    eyebrow: "Staff console",
    title: "Customer context and account actions",
    summary:
      "Staff can search for a customer, enter that customer context, use the storefront as the customer, or record customer-level account notes and credits without impersonating the customer.",
    useFor: [
      "Helping a customer shop while on the phone.",
      "Checking what a customer sees in their account.",
      "Editing a saved address after customer verification.",
      "Recording customer-level notes and account credits that are not direct card refunds.",
      "Starting from recent Medusa orders or imported QuickBooks history.",
    ],
    howTo: [
      "Go to Staff Console from the account nav.",
      "Use Customer Account when staff need to record an account-level note or credit without entering the customer's storefront session.",
      "Search by name, email, phone, or order number. Select the storefront customer, then choose Note or Credit.",
      "For a customer credit, enter the amount, reason, staff note, optional customer-visible note, and optional related order. The credit belongs to the customer account and queues a QuickBooks customer credit memo follow-up.",
      "Use Customer Context when staff need to impersonate the customer, then search by name, email, phone, or order number.",
      "Click Enter Account Context only after selecting the correct customer. The banner tells you when you are acting as that customer.",
      "In checkout, use the address step to select an existing address, edit the current saved address, or add a new address; the cart should stay in that customer context.",
      "Use Exit Context when done so you do not keep shopping as the customer by mistake.",
    ],
    watch: [
      "Legacy QuickBooks-only records are useful for lookup but may not be impersonatable unless they are linked to a storefront customer.",
      "Creating a storefront account does not create a QuickBooks customer. QuickBooks customer records are created or linked when the first accounting-ready order posts.",
      "Customer credits are not Stripe refunds. Use card refund in Order Support when money should go back to the card.",
      "Staff context actions are audited to the staff member.",
      "Always verify identity before entering account context or saving address/profile changes.",
    ],
  },
  {
    id: "phone-orders",
    eyebrow: "Phone orders",
    title: "Creating a staff phone order",
    summary:
      "The phone-order workspace lets staff create or select a customer, add products, choose fulfillment, handle inventory warnings, and either collect a card by phone or send a checkout link.",
    useFor: [
      "A customer calls and wants staff to place the order.",
      "A new caller needs a storefront account created.",
      "A customer wants to repeat items from recent or legacy order history.",
      "A customer wants a checkout link rather than reading card details over the phone.",
    ],
    howTo: [
      "Search for the customer first. If there is no match, use Create Account and enter email, phone, name, company if needed, and delivery address.",
      "If creating a new account, leave the account-claim email enabled unless there is a reason not to send it.",
      "Staff-created accounts do not enroll customers in marketing texts. The customer must use the unchecked marketing-text checkbox themselves during storefront account signup or first-login contact verification.",
      "Add products with product search or from recent or QuickBooks history when available.",
      "Review ATP and availability messages. Inactive items cannot be sold. Partial or blocked lines need an override reason and note.",
      "Choose fulfillment type, substitution preference, delivery notes, and order notes. Create Draft and Choose Date then shows the same confirmed calendar used by customers. For regional pickup, choose a location in the customer's state first.",
      "Check Customer identity and order details verified after reading the order back to the customer.",
      "For Collect card by phone, check the customer authorization box and create the draft. Choose and confirm an available date and window before the card form appears. The date, staff access and inventory are checked again before card confirmation and order placement.",
      "For Send customer checkout link, create the draft and confirm its date. Only then is the link prepared and, if the email box is checked, emailed. A customer opening an expired date must confirm a current date in checkout. The customer may choose the optional order-text box themselves.",
    ],
    watch: [
      "Never enter card details without explicit customer authorization.",
      "An empty calendar or unavailable route is not permission to type a date manually. Choose another available option or ask the office to review the operating schedule. Changed draft details require a new draft and date confirmation.",
      "If the screen says card payment was confirmed but the order was not, open order support and reconcile the payment before taking another payment.",
      "Checkout links expire and stop working when the preparing staff member's access changes. Sign in again and prepare a new cart or link after the office reviews the order; an old link does not regain permission when access is restored.",
      "Phone-order emails are separate from standard order confirmation emails; verify both when testing.",
      "A phone number or verbal request is not consent for marketing texts or order-update texts. Do not add either consent on the customer's behalf.",
      "If a line needs an override, the note should explain what the customer accepted or who approved it. After choosing the actual date, explicitly confirm that approval still applies to these quantities and that date. Changing the selected date clears that confirmation. A note alone does not approve changed details.",
      "The signed-in staff member is recorded as the person preparing the order, while the selected customer remains the buyer. Prepare a new cart if the customer account or email needs to change. Older staff carts without verified preparation must also be prepared again.",
    ],
  },
  {
    id: "catch-weight-finalization",
    eyebrow: "Back office",
    title: "Pack & Finalize catch-weight orders",
    summary:
      "Pack & Finalize is the staff queue for every submitted launch order. The digital workflow starts with picking, moves to packing only after the picker marks the order ready, then ends with final charge and release by an approved staff member.",
    useFor: [
      "Every submitted customer order, because launch orders contain catch-weight items whose actual cut weight is not known until staff pick from the meat cabinet.",
      "Recording picked quantities, shortages, substitutions, and removals before the lug reaches packing.",
      "Recording packer-confirmed quantities and actual per-lb item weights before shipment.",
      "Recording every shipper, cooler, or igloo as its own container row. UPS shippers also need dry ice and full packed weight.",
      "Reviewing the final total against the original estimate.",
      "Using the packed UPS box weights to refresh the final shipping rate when WWEX / Unishippers live rates are configured.",
      "Charging the saved Stripe card right before the order leaves when the staff account has final-charge permission.",
      "Holding an order when the final charge fails.",
    ],
    howTo: [
      "Open Staff Console and choose Pack & Finalize.",
      "Use the queue filters to find orders by order number, customer email/name, ZIP, fulfillment method, or Ship / pickup date range. Date filters and sorting use the day the order leaves the plant or is collected there. Preparation and customer arrival/pickup dates are shown separately. An older shipped or regional order with no dispatch date stays visible without a date filter and needs office review; its customer arrival date is not a shipping date. Turn on Group by date to work one dispatch day at a time.",
      "The audit trail is a super-admin-only disclosure on the order. It records who changed the order, what changed, and when it happened, but it is not part of the normal picker or packer workflow.",
      "Pickers use the Picking tab. Claim the pick and enter the actual Picked quantity for each line. If the wrong picker claimed the order or needs to step away, use Unclaim Pick; saved line work stays on the order and the release is recorded in the timeline.",
      "If Picked is 0, use Out Of Stock or leave Picked at 0 and save. If Picked is lower than Ordered but not 0, use Some Out Of Stock or save the partial picked count. The system records the shortage reason as Out of stock. Use Substitute only when replacing the item with another product. New lines start with Picked at 0.",
      "Click Ready For Packing only when every line is picked, removed, or substituted and the lug can move to the packing table.",
      "Packers use the Packing tab. It includes orders ready for packing, orders actively being packed, and orders the office sent back for packing corrections. Claim the pack before entering final pack data so two staff members do not work the same order phase at once. Claim Pack snapshots the picker handoff and resets the packer-confirmed Packed quantity to 0.",
      "Use the Per pack and By weight chips to see what the line needs. Per-pack lines need the packer-confirmed Packed quantity. By-weight lines show one item-weight box for each picked or ordered pack; every displayed pack must have a weight before the line is ready.",
      "Packers do not remove, substitute, or add product lines. If the packer finds a missing item, wrong item, or count mismatch, use Send Back To Picking with a short reason. The order returns to the picker queue; staff can still handle the correction verbally while the super-admin audit trail records the handoff.",
      "Line edits autosave as staff type, and final totals refresh after each saved change. Use Save Line only when you want to validate a line immediately.",
      "If the picker adds an item that was not on the original customer order, use Add item, search the product, enter the fulfilled quantity, and choose a product with a saved QuickBooks item ID.",
      "If the picker substitutes a line, click Substitute, find the replacement product, confirm the replacement QBD ListID and replacement unit price, and record the substitution reason.",
      "If a picker cannot fill a line, leave Picked at 0 and save the line, or click Out Of Stock. The shortage reason is recorded as Out of stock automatically.",
      "In Packing complete details, record each shipper, cooler, igloo, or other container used as its own row. For UPS shipping orders, enter Micro, 330 Medium, 345 Large, or 360 Extra large, the full packed weight from the scale, dry ice pounds weighed separately, and any package note.",
      "Do not mark a container over 50 lb including product, dry ice, and packaging. Split the order into another box.",
      "Fix any missing weights, missing QBD ListIDs, replacement identities, shipping boxes, substitution reasons, or removed-line reasons shown in the queue.",
      "Packers click Mark Ready For Charge only after the final total is correct and the order is packed. Packers do not charge cards.",
      "Front office staff use Ready to charge for final review. If items are missing or wrong, send the order back to Picking with a note. If boxes, coolers, weights, or packing details need correction, send it back to Packing with a note.",
      "Click Charge Card & Release only from a staff account with final-charge permission when the order is ready to leave. If Stripe fails, do not ship the order.",
      "For UPS shipping orders, Charge Card & Release can use the recorded package rows to refresh the WWEX / Unishippers rate before Stripe is charged. If WWEX is unavailable, the order preserves the existing shipping estimate and records the fallback in order metadata.",
      "Use Charge holds for orders where the final charge failed or cannot be completed. Contact the customer for an updated payment method, then retry the charge or send the order back to Picking or Packing if the review uncovered an operational issue.",
      "After a successful charge, the order moves to Ready ship. Click Mark Fulfilled when staff physically hand off the pickup, delivery, or shipment so Medusa records the fulfillment.",
      "After fulfillment, verify QuickBooks posting is pending or complete.",
    ],
    watch: [
      "Stripe must not see an estimated catch-weight amount. It should only see the final weighed amount at Charge Card & Release.",
      "Team Access can assign Office, Picker, Packer, Manager, or Super Admin roles. Legacy General staff remains broad access for existing staff.",
      "Pickers can pick and hand off orders. Packers confirm packed counts, enter item weights, record boxes or coolers, and send mismatched orders back to picking. Managers and super admins can be granted final-charge permission.",
      "Packers can enter packing data without being allowed to charge saved cards. Super admins grant final-charge permission in Team Access.",
      "Every Pack & Finalize mutation should write to the order staff timeline, including claim pick, unclaim pick, ready for packing, claim pack, line edits, added items, substitutions, removals, send back to picking, send back to packing, package capture, ready-for-charge, charge attempts, and fulfillment.",
      "Card orders cannot be fulfilled until the final Stripe charge succeeds. Approved pay-by-invoice orders keep their separate invoice-and-ship workflow.",
      "If fulfillment says payment status could not be verified, hold the order and retry fulfillment after the service recovers. Do not charge the card again or switch payment methods to clear this error. If it continues, ask a manager to reconcile the Medusa order and Stripe payment before retrying.",
      "Ready ship means the card has been charged and fulfillment is allowed; it does not by itself mean Medusa has a fulfillment record.",
      "QuickBooks sales orders are created from the checkout estimate so Peter can see demand immediately. After Charge Card & Release, QuickBooks receives a finalized invoice with the weighed lines. For per-lb invoice lines, QuickBooks quantity is the final pounds and QuickBooks amount is the final line subtotal; fulfilled quantity and staff notes travel in the line metadata or description.",
      "Staff-added items post as finalized accounting lines even though they were not part of the original customer cart. Add them only when the product identity and QBD item are clear.",
      "For UPS or free-shipping orders, the final total should preserve net shipping and promotion adjustments. If the final charge looks lower by the free-shipping amount, hold the order and escalate before charging.",
      "WWEX / Unishippers shipment booking and label retrieval are controlled by backend configuration. A successful final charge does not prove that a UPS label was booked; check the WWEX booking metadata or escalation note if staff expect a label.",
      "Use customer-safe product names when discussing substitutions. QBD ListIDs are staff/accounting identity only.",
      "A charge-failed hold means contact the customer for payment update before shipment. It is owned by front office staff, not the packer.",
      "Final charge email goes after the card charge succeeds. It is separate from the checkout confirmation email.",
    ],
  },
  {
    id: "order-support",
    eyebrow: "Order support",
    title: "Refunds, cancellations, notes, and QBD retries",
    summary:
      "Order Support is an order lookup and exception workspace, not the fulfillment queue. It can search current Medusa orders and imported legacy QuickBooks history, then apply audited actions to live Medusa orders.",
    useFor: [
      "Finding open, fulfilled, paid, refunded, or historical orders.",
      "Recording internal notes.",
      "Refunding a captured Stripe card payment.",
      "Capturing a rare non-catch-weight authorized payment. Catch-weight launch orders charge from Pack & Finalize after final weights are known.",
      "Recording a shipping override only before the picker claims the pick, or after the pick has been put back.",
      "Adding, removing, or changing order item quantities before a picker claims the pick, or after the picker has put the order back.",
      "Canceling a pre-pick order, or handling a manager-level cancellation escalation before final charge.",
      "Retrying a failed QuickBooks posting.",
    ],
    howTo: [
      "Open Staff Console and choose Order Support.",
      "Search by order number, invoice, email, customer name, phone, or ZIP. Use the queue, fulfillment state, payment state, fulfillment method, date, and sort filters when support needs a starting list.",
      "Results update as filters change. Use pagination at the bottom of the list when the match set is larger than one page.",
      "Select the order and review item, payment, fulfillment, audit, and QBD status before choosing an action.",
      "Order Support actions change by order phase. Before picking starts, front office can edit items, change the requested date or mode, cancel, record notes, and handle QBD retries. Once a picker claims the order, item edits and shipping overrides disappear until the pick is put back or the order is sent back through Pack & Finalize.",
      "Pick the action. Add a reason, internal staff note, and customer consent method when required.",
      "Use Edit items only before the order is actively picked. The screen shows current lines, new quantities, zero-line controls, and catalog search for added mapped items.",
      "Use Shipping override only before the order is picked. If staff need to change date, mode, or address after picking starts, send the order back or hold it from Pack & Finalize before changing the customer promise.",
      "For an item edit, Review first. Apply creates the Medusa order edit, refreshes Pack & Finalize line snapshots, writes the staff audit trail, and queues the QuickBooks SalesOrder item update.",
      "For refund, capture, or cancellation, review first and type the required confirmation word. After picking starts, normal office cancellation is blocked; manager or super-admin escalation is required before final charge, and charged orders should use refund, customer account credit, fulfillment, or QBD follow-up instead.",
      "Apply the action only after reading the warning panel. The audit timeline records the result.",
      "For legacy QuickBooks history, use the view for context only. Live money and cancellation actions are read-only there.",
    ],
    watch: [
      "Stripe card refunds send a refund email from the payment.refunded event and queue a QuickBooks accounting posting task.",
      "Offline payments, check refunds, and customer credits are disabled in Order Support for launch. Use Stripe card capture/refund, Customer Account actions for account credit, or record an internal note for accounting follow-up.",
      "Canceling before QuickBooks posting is skipped in QBD; canceling after QuickBooks posting queues a sales-order close task for Web Connector.",
      "Cancellation can be blocked once picking, packing, final charge, or fulfillment has started. Record a note, send the order back in Pack & Finalize, or use a refund/customer-credit follow-up when the order is locked.",
      "Item edits are blocked once a picker claims the pick. Ask the picker to Unclaim Pick or send the order back before changing the customer order in Order Support.",
      "Shipping overrides are blocked once a picker claims the pick. Changing the date or mode after physical work starts can invalidate packing, dry ice, route, UPS, and customer-promise assumptions.",
      "Added items must have a QuickBooks ListID. If a catalog search result is missing one, do not add it from Order Support.",
      "Order Support item edits do not charge the customer. Stripe still only receives the final weighed charge from Pack & Finalize.",
      "Capture card is not the catch-weight launch charge path. Use Charge Card & Release from Pack & Finalize so Stripe sees only the finalized weighed amount.",
      "Retry QBD only appears when a previous QBD posting failed and has a retry key.",
    ],
  },
  {
    id: "communications-center",
    eyebrow: "Communications",
    title: "Customer communications center",
    summary:
      "Customer Communications is the staff view for the first-party lifecycle platform. Medusa stores profile, identity, event, cart lifecycle, segment, flow, campaign, suppression, attribution, template, import, and message-log records. Postmark delivers the actual emails.",
    useFor: [
      "Reviewing a customer's order, email, segment, lifecycle, and delivery timeline in one place.",
      "Sending an approved staff note to a customer when order support needs a separate email.",
      "Creating campaign drafts for consented audiences before sending through Postmark broadcast streams.",
      "Checking lifecycle flows such as welcome, abandoned cart, post-purchase, reorder, second-order loyalty, at-risk, dormant, holiday reminder, and back-in-stock follow-up.",
      "Reviewing whether a customer explicitly opted into marketing texts through a customer-controlled storefront checkbox.",
      "Understanding the separate, order-scoped UPS shipping and tracking text choice shown at checkout.",
      "Checking whether an email was queued, sent, delivered, bounced, complained, unsubscribed, or suppressed.",
      "Reading 30-day reporting for attributed revenue, recovered carts, delivery targets, imports, and event mix.",
    ],
    howTo: [
      "Open Staff Console, then Customer Communications.",
      "Use Profiles to search by customer email, name, or customer ID and inspect their activity timeline.",
      "For SMS marketing, confirm the profile has current marketing-only consent with the customer-controlled source, timestamp, copy version, phone number, provider, program, and exact disclosure before asking for a Twilio campaign send.",
      "For UPS shipping and tracking texts, the customer must choose the separate unchecked box during checkout. The box is not shown for pickup or Atlanta delivery. That choice applies only to the UPS-shipped order and allows up to six messages for the order.",
      "After an opted-in order is placed, the program attempts one required non-promotional enrollment confirmation. After that, only a real UPS shipment or tracking event can trigger an order text. Pickup-ready and local-delivery texts stay off; do not use Ready ship, a final charge, a delivery closure, or a staff promise as a substitute.",
      "If a customer asks about an order, verify fulfillment and tracking in Medusa and use phone or email support. Never promise that a text will arrive.",
      "Use Send a staff note for customer-safe one-off messages. Keep product names customer-safe and do not include QuickBooks ListIDs or item hex values.",
      "Use Campaigns to draft a subject, intro, body, audience segment, schedule, and call to action. Send a test before sending to the audience.",
      "Use Flows or Run flows to process cart expiry, due lifecycle steps, refreshed segments, profile lifecycle stage changes, and scheduled campaigns.",
      "Use Reports to review attributed orders, attributed revenue, recovered carts, abandoned carts, and recent event mix.",
      "Use Templates to confirm which customer-safe templates exist before asking Postmark or engineering to change copy.",
      "Use Health to check Redis queue configuration, queue backlogs, ClickHouse delivery, GA4 delivery, and failed sends.",
      "Use Imports when migrating Constant Contact rows. Preserve unsubscribes and bounces before sending any marketing.",
    ],
    watch: [
      "Marketing and lifecycle unsubscribes must not block order-critical transactional emails.",
      "Postmark stream and message purpose are different. One-to-one abandoned-cart recovery may use the transactional Postmark stream, but it still requires marketing consent and respects cart-recovery preferences.",
      "Twilio is the assumed SMS delivery provider, but Medusa remains the durable consent source. Only the current marketing-only consent collected by a customer-controlled storefront checkbox qualifies; staff-created, prechecked, mixed-use, or older consent does not.",
      "The marketing toll-free program remains marketing-only. The dedicated order-update program is separate and limited to an enrollment confirmation plus real UPS shipping and tracking updates for an order with its own valid checkout consent.",
      "Order-text consent may be collected before the dedicated sender is approved. SMS sends only after carrier verification is approved and the backend gate is enabled; until then, email remains the operational channel.",
      "STOP opts the phone out of order updates only. START or UNSTOP may restore carrier delivery, but Medusa sends only while a still-valid consent exists for that order. HELP returns program and support information.",
      "Describe the marketing program only as seasonal specials, product announcements, promotional offers, and holiday sales deadlines. Message frequency varies, up to 6 messages per month.",
      "When no trusted recipient timezone is available, marketing texts can send only from 3:00 p.m. to 9:00 p.m. Eastern. Staff test texts require qualifying consent, obey the same window, and count toward the hard six-message rolling 30-day cap.",
      "Campaigns and broad announcements use the broadcast stream. Order, refund, cancellation, password, and account messages remain transactional or service messages.",
      "A Postmark send status does not prove the customer opened or clicked the email.",
      "Do not use this console as the order source of truth. Use Medusa and Stripe for order/payment state.",
      "Attributed revenue means a customer ordered after a lifecycle or campaign touch. It is useful for marketing decisions, not accounting.",
      "If Redis queues are not configured, scheduled Medusa jobs run the fallback path. That is acceptable, but slower and less visible.",
      "If a customer says an email has the wrong product name, compare against Strapi and Medusa customer-facing product titles first.",
    ],
  },
  {
    id: "inventory",
    eyebrow: "Inventory",
    title: "Allocation, out of stock, and waitlists",
    summary:
      "Out of stock and inactive are different promises. Out of stock means the item is still sellable but not available now. Inactive means the business does not want customers expecting it soon.",
    useFor: [
      "Preventing oversells while still accepting reasonable future demand.",
      "Letting customers join a back-in-stock list for active sellable items.",
      "Keeping seasonal Passover or discontinued items from creating false waitlist expectations.",
      "Reconciling active customer demand against QuickBooks quantities.",
      "Reviewing the opening stock baseline with Peter and the stock operator before enabling tracked inventory for launch.",
    ],
    howTo: [
      "For the launch stock review, ask the technical operator for the protected baseline report. Review each sellable item's count or weight unit, usable quantity, source company or physical count, count date, warehouse location, and existing order commitments. The report reads current records; it does not change stock or approve quantities.",
      "Resolve missing item links or warehouse stock records and record who approved each quantity and exception. Keep raw materials out of the launch customer catalog. Unknown stock must be checked; an item with tracking turned off does not prove unlimited availability.",
      "Active plus zero quantity means an item can be waitlist eligible if waitlist is enabled.",
      "Seasonal inactive and discontinued products should not show normal waitlist capture unless there is a deliberate override. Internal-only products are never eligible for customer waitlists.",
      "Staff product search shows available to promise, future allowed, partial, blocked, or inactive.",
      "Partial and blocked lines may need an approved staff override before payment. Inactive lines must be replaced.",
      "Back-in-stock requests are stored in Strapi and emailed by Postmark when the trigger sees the item back in stock.",
      "The restock trigger respects a cooldown so customers are not spammed by inventory bouncing in and out.",
    ],
    watch: [
      "Keep the detailed stock report private because it includes internal item and order references. Share summary counts in launch updates. A completed report is preparation; the separately approved stock update and checkout checks are still required.",
      "Medusa reservations and the advisory allocation list can describe the same order commitment. Compare order-line references before adjusting stock. Never subtract both totals automatically, delete an unmatched commitment, or run a forced QuickBooks product sync to make the numbers agree.",
      "Do not use inventory quantity to mean inactive. Use lifecycle fields for inactive status.",
      "Do not use inactive for a product that should accept future or waitlist demand.",
      "Refunds and cancellations can release allocation, but that must be verified in Medusa allocation state, not assumed from Stripe alone.",
    ],
  },
  {
    id: "fulfillment",
    eyebrow: "Fulfillment",
    title: "Pickup, delivery, and shipping operations",
    summary:
      "Fulfillment choices drive dates, fees, thresholds, addresses, and customer instructions. The site currently supports plant pickup, Atlanta delivery, Southeast pickup, and UPS shipping.",
    useFor: [
      "Explaining pickup details and ID/order-number reminders.",
      "Checking Atlanta delivery ZIP eligibility and time windows.",
      "Checking Southeast pickup locations and dates.",
      "Maintaining plant-closure, UPS-pickup, and UPS-delivery blackout calendars.",
      "Checking UPS shipping minimums, rates, cold-chain settings, and fallback rates.",
      "Verifying whether checkout is using the historical shipping forecast model, WWEX / Unishippers live rating, or fallback rates.",
    ],
    howTo: [
      "Checkout reads fulfillment settings from Strapi. Carrier shipping also needs reviewed item weights and a published packing policy; missing inputs can make that shipping option unavailable.",
      "All four date pickers use the backend calendar. In Strapi Checkout, the operating owner must approve and publish the Fulfillment Calendar Policy, with coverage dates, Eastern cutoffs, preparation times and pickup windows. Historical cutoffs are not an approval for a new calendar.",
      "Atlanta delivery uses ZIP/day configuration and delivery windows.",
      "Southeast pickup uses confirmed Strapi route dates and Calendar Windows, Calendar Cutoff Days/Time and Calendar Preparation Days/Pack Time. An empty or past-only route has no bookable dates. Eligibility is state-wide: a Tennessee address can choose any active Tennessee stop, while a Texas address is shown Dallas Consolidated Shipping.",
      "UPS shipping uses shipping settings, origin ZIP, fallback amount, and the customer's requested arrival date. Ground is offered only where the transit table is 3 business days or less; longer-distance ZIPs use 3 Day Select as the baseline with 2nd Day and Overnight as paid premium options. The approved calendar controls UPS dispatch and arrival days. A separate approved transit fallback must name its origin, destination ZIP prefix, service, business days, revision and coverage. The carrier estimate is checked when a customer confirms a date; a changed estimate needs another explicit confirmation.",
      "In the Checkout singleton, maintain Fulfillment Blackout Dates by date and label. Mark each row separately for plant operations, UPS pickup, and UPS delivery; one date may block any combination of the three.",
      "Peter's SAM weight entries are retained for review. A value used to allow extra box space is not the food's physical weight. Engineering imports approved records by the stable QuickBooks item identity, keeping physical pounds or ounces, the number of units in a pack, and the separate box-space allowance distinct.",
      "In Strapi's cold-chain settings, the reviewed packing policy names the box dimensions, empty-box weight, gross-weight limit, box-space capacity and its calibration, and dry ice by elapsed packed days, including nights, weekends and holidays. Carrier business days remain a separate value. Publish a new policy version only after Peter approves the rules. Missing or incompatible rules stop carrier quotes for review.",
      "Checkout shipping can use a historical forecast model trained from actual Unishippers shipment costs joined to QuickBooks order facts. It estimates the commercial shipping charge — a mean-unbiased prediction plus a small safety buffer — before staff know final boxes, dry ice, catch weights, or packed weights. It stays disabled until a reviewed model is installed.",
      "Once item weights and packing rules are approved, checkout can fall through from a compatible forecast to WWEX / Unishippers quotes, then Strapi shipping-zone rates. A historical forecast must be revalidated for the new physical-weight inputs before it can price these orders. A missing weight is a review problem, not a reason to accept a one-pound quote.",
      "At pack/finalize, UPS package rows are the source for final packed-box rating. Enter each box or cooler, its full measured packed weight, and its dimensions or an approved box type with configured dimensions. The accepted estimate remains on the order; later catalog or dry-ice edits must not rewrite it.",
    ],
    watch: [
      "Confirmed pickup and delivery windows display the published label and timezone. Calendar source changes are read again when a date is selected and when an order is submitted. Missing, expired or incomplete operating data stops date selection; it never activates a generic schedule.",
      "An edited basket, address, shipping service, expired quote or changed policy can require the shopper to refresh dates and confirm again. Never promise a date by typing it into cart metadata.",
      "The customer chooses an arrival or pickup date; the backend separately records the plant preparation and dispatch dates. QuickBooks Sales Order Due Date is the dispatch date. An institutional invoice payment deadline is separate and follows the QuickBooks account terms unless an explicit invoice deadline was approved. Check both documents; a dispatch date must not make an invoice payable early. Accepted orders keep their original promise; a later route cancellation needs staff exception handling and customer contact.",
      "Phone-order drafts use the shared calendar before payment. Release gate: the post-order shipping-override flow still needs the approved amendment workflow, including calendar, price and inventory consequences. Do not use its free-form date field to replace an accepted promise.",
      "Keep blackout meanings separate. A UPS no-pickup date blocks outbound dispatch, a UPS no-delivery date blocks customer arrival, and a plant-operations closure blocks pack-out plus local pickup/delivery routes. A UPS holiday does not automatically mean the plant is closed.",
      "After changing a route date or blackout, publish the Strapi record and verify checkout using an address in the affected state or ZIP.",
      "If checkout rates look wrong, check whether the historical forecast model is enabled and current, then WWEX configuration, then Strapi fallback settings and Medusa shipping options.",
      "If shipping asks for a weight or packing review, escalate the affected item and order to the shipping owner. Do not invent a weight or substitute the SAM space allowance for food weight. A reviewed import starts with one approved item and readback before a batch is permitted.",
      "Older orders may have no recorded packing estimate. Reports should show that estimate as unavailable. The price-policy release must separately establish how much of the customer shipping charge is freight, packaging or other adjustments.",
      "QuickBooks sales orders include a fulfillment memo code and a Due Date for plant planning, but QuickBooks is not the checkout source of truth.",
    ],
  },
  {
    id: "emails",
    eyebrow: "Email",
    title: "Customer emails and Postmark",
    summary:
      "Transactional emails tell the customer what happened. They must use the same customer-safe product names as the storefront, link item names back to PDPs when a product handle exists, and include SKU plus pricing basis as helpful subtext, not QuickBooks accounting names.",
    useFor: [
      "Welcome and account claim emails.",
      "Password reset emails.",
      "Order placed emails for shipping and pickup.",
      "Order shipped emails.",
      "Order canceled emails.",
      "Refund issued emails.",
      "Final charge emails for catch-weight adjustments.",
      "Back-in-stock confirmation and restocked emails.",
      "Review acquisition emails.",
      "Staff phone-order review and paid confirmation emails.",
      "Lifecycle and campaign emails sent from Customer Communications.",
    ],
    howTo: [
      "Order emails are built from Medusa order data enriched for customer-safe display.",
      "Order, shipped, canceled, and final-charge item rows should show a PDP-linked customer title, SKU subtext, and whether the item is priced by pound or by pack. Per-pound rows should include the customer-facing price per pound when the order data can derive it.",
      "Refund emails are triggered by the payment.refunded event after the refund is created.",
      "Cancellation emails are triggered by order cancellation events.",
      "Back-in-stock emails use the Strapi back-in-stock request row and product snapshot.",
      "Email remains the source for order confirmations, payments and final charges, cancellations, refunds, and fallback communication even when a customer chooses UPS shipping and tracking texts.",
      "Customer Communications records every tracked send in the message log before Postmark delivery is attempted.",
      "Postmark webhooks update delivery, open, click, bounce, spam complaint, and unsubscribe status back into Medusa.",
      "Each tracked email has both a Postmark stream and a message purpose. The purpose decides consent and suppression rules.",
      "Email preferences can suppress individual marketing topics such as promotions, recipes, holiday reminders, and back-in-stock alerts.",
      "If a customer reports a wrong product name, compare the email to the storefront PDP title and Strapi product title first.",
    ],
    watch: [
      "Do not send QuickBooks item names, ListIDs, item hex values, or seasonal sorting prefixes in customer email rows.",
      "If an order email item row is missing a PDP link, pricing basis, or per-pound rate, check the Strapi product handle, PricingMode, AvgPackWeight, and Medusa order line metadata before editing the template.",
      "A customer note in Order Support is not always automatically emailed. Confirm before promising the customer will receive that note.",
      "If a refund succeeds but no email arrives, check the Medusa payment.refunded event and Postmark delivery before blaming Stripe.",
      "Marketing and lifecycle email preferences do not stop transactional order, refund, cancellation, password, or account emails.",
    ],
  },
  {
    id: "strapi",
    eyebrow: "Strapi",
    title: "Operating the content system",
    summary:
      "Strapi is where staff should edit content and customer-facing product details. It is not where staff should manually force payment, order, or accounting state.",
    useFor: [
      "Homepage sections, header, footer, customer service, legal, shipping, kashruth, holiday, recipes, learn articles, curated collections, testimonials, and checkout copy.",
      "Product titles, featured image, gallery images, product metadata, ingredient disclosures, SEO, social metadata, and related recipes.",
      "Exact product Hechsher flags: OU, Chassidish Recognized, CHK Certification, AgriStar Lamed-K Lubavich or Rabbi Weismandl, and AgriStar Lamed-K Lubavich.",
      "Availability lifecycle, waitlist settings, future-order eligibility, replenishment lead days, safety stock, unavailable copy, and suggested alternatives.",
      "Experiment records, variant content drafts, and placement content for content-driven tests.",
      "Back-in-stock request review when needed.",
    ],
    howTo: [
      "Open the correct Strapi content type, make the edit, and publish if the content type uses draft/publish.",
      "For a recipe photo, update the recipe's Image field and publish. Check the recipe hub card and the recipe detail page; both use that image without a site rebuild. If Strapi is unavailable, the hub keeps its saved images until the lookup recovers.",
      "For the homepage Recipes & Guides section, Strapi controls the heading, images and button wording. The button always opens the recipe hub; the old Button URL field no longer changes that destination. Keep its wording about recipes or cooking. Holiday dates still need the approved operating calendar; a working link does not confirm the dates.",
      "For product edits, use the customer-safe Title and PDP fields. Do not edit QuickBooks ListID unless you are deliberately correcting accounting identity.",
      "Treat the five Hechsher flags as exact Item Manager categories joined by QuickBooks ListID. Use the controlled backfill for catalog-wide changes; do not guess a flag from a title, description, brand, or SKU.",
      "Hechshers are certification fields only. Keep separate kashruth attributes such as Chassidish shchita and Kosher for Passover unchanged unless their own source data is being corrected.",
      "For lifecycle, choose active, seasonal inactive, discontinued, or internal only. Use Waitlist Enabled only when customers should expect notification when it returns.",
      "For checkout settings, edit available days, fulfillment blackout rows, pickup notes, delivery lead time, and shipping settings with care. Use the separate plant-operations, UPS-pickup, and UPS-delivery switches on every blackout row.",
      "For experiment content, keep variants in draft until the experiment is approved. Publish only the records that should be available to the storefront.",
      "For media, use actual product or relevant page imagery. Avoid stock-like or unrelated photos.",
    ],
    watch: [
      "A public read token may not be able to write. If a backfill fails, verify token capability before assuming code is broken.",
      "Catalog and pickup-route backfills require a verified backup plus a write-capable admin session. Run the dry-run audit first and verify one published record through the public storefront path before continuing.",
      "Medusa-to-Strapi updates must fail closed if the existing Strapi record cannot be read. Do not let a sync fall back to QuickBooks or raw Medusa copy for product titles, descriptions, media, categorization, SEO, recipes, or merchandising fields.",
      "Medusa product deletion does not delete the Strapi product by default. Destructive Strapi sync requires a verified backup, a written cutover plan, and the explicit STRAPI_ALLOW_DESTRUCTIVE_SYNC=true backend switch.",
      "After sync changes, check QuickBooksListId, allocation fields, customer-safe titles, descriptions, featured images, gallery images, categorization, SEO, social metadata, and recipe associations.",
      "Do not move structural UX into Strapi. Strapi experiment records should manage content and placements; code controls major layout or checkout behavior.",
      "Generated or edited content should be published before staff expect it on the live site.",
    ],
  },
  {
    id: "medusa",
    eyebrow: "Medusa",
    title: "Operating the commerce backend",
    summary:
      "Medusa is the operational record for orders, carts, customers, products, variants, inventory, payments, saved cards, and fulfillment state.",
    useFor: [
      "Checking whether an order exists and what state it is in.",
      "Checking payment setup, final catch-weight charge, refund, and cancellation state.",
      "Checking product and variant IDs, SKUs, inventory quantities, and metadata.",
      "Checking customer profiles, addresses, saved cards, and account history.",
      "Checking allocation rows and availability snapshots when inventory is questioned.",
    ],
    howTo: [
      "Use Medusa order state to answer whether checkout completed.",
      "Use Stripe payment state to answer whether money moved.",
      "Use QuickBooks sync state to answer whether accounting posted.",
      "Use catch-weight finalization state to answer whether an order can leave the building.",
      "When editing product metadata, preserve qbd_list_id and allocation policy fields.",
      "For staff money actions, use the staff console unless a developer directs a specific backend operation.",
    ],
    watch: [
      "Medusa Admin can include legacy, disabled, reorder-only, or admin-only products. Do not treat every admin product as a storefront gap.",
      "A successful Stripe refund can still leave QBD posting pending.",
      "A catch-weight order can be placed with a saved card but no Stripe charge. Do not treat the checkout estimate as collected revenue.",
      "If a customer asks to close or delete their web account, do not delete QuickBooks customer records. Preserve accounting history, remove saved cards when appropriate, and suppress marketing if requested.",
      "Order cancellation after fulfillment may be restricted and may require operations review.",
    ],
  },
  {
    id: "quickbooks",
    eyebrow: "QuickBooks",
    title: "QuickBooks Desktop and Web Connector",
    summary:
      "QuickBooks is accounting infrastructure. The Web Connector pulls requests from the sync service, exchanges QBXML with QuickBooks Desktop, and returns results.",
    useFor: [
      "Pushing Medusa orders into QuickBooks as sales orders.",
      "Creating or linking the order's customer in QuickBooks at the first accounting event.",
      "Posting finalized catch-weight orders with actual weighed quantities and amounts.",
      "Reading QuickBooks catalog items, quantities, active status, ListIDs, and tax items.",
      "Posting accounting follow-up for refunds, captures, credits, and sales-order closes.",
      "Reconciling inventory allocation against QBD on-hand quantities.",
    ],
    howTo: [
      "Keep QuickBooks Desktop open on the connected machine with the correct company file.",
      "Keep QuickBooks Web Connector auto-run enabled for the Griller's Pride application.",
      "Use Last Result or the log when Web Connector says it sent an error back to the application.",
      "If QBXML parse errors appear, check the generated request and the specific item or tax config causing the parse failure.",
      "Use Staff Console > Synchronization Status to see orders waiting for QuickBooks, rows stuck with an error, skipped/canceled rows, recent Web Connector sessions, and recent sync logs.",
      "If Synchronization Status says Web Connector needs attention, fix that first. Missing credentials or rejected authentication means QuickBooks is not actually pulling orders even if the desktop progress bar looks green.",
      "Use Retry only after the bad data, product mapping, tax mapping, or sync bug has been corrected. Retry clears the block and lets Web Connector attempt the order again.",
      "Use ListID for product matching. SKU is a fallback only.",
      "For taxed orders, QuickBooks should receive the native sales tax item for the destination address. Shipping and delivery lines should remain non-taxable.",
      "New QuickBooks sales orders should be marked Print Later and should include the specific fulfillment service item: del-ZIP for Atlanta delivery, del - City for Southeast delivery, or the plant pickup/pickup-discount item.",
      "New QuickBooks sales orders should use the Due Date as the ready-by date. The Memo starts with Peter's planning code: P/Up, L/D, Southeast pickup city, UPS/G, UPS 3Day, UPS 2Day, or UPS O/Night.",
      "Customer checkout instructions stay in the QuickBooks Sales Order memo for planning and print as their own description row on the final Invoice.",
      "Final Invoices use Peter's Custom S.O Invoice template and QuickBooks' normal invoice-number sequence. They should show Bill To and Ship To, the original QuickBooks Sales Order number, specific delivery or UPS service, Subtotal, packed shipper containers, and any customer instruction. New orders must not include a CCC card-fee line.",
      "For a paid card order, QuickBooks should apply the received card payment to that exact Invoice and then show a zero balance. Pay-by-invoice orders intentionally remain unpaid in QuickBooks accounts receivable until Peter records Zelle, check, or wire payment.",
      "Staff notes entered before the Sales Order posts should be included in the initial QuickBooks memo. Staff notes entered after the Sales Order exists should be appended by the Web Connector writer.",
      "For sync health, use the sync service dashboard/logs or health command rather than relying only on the green Web Connector bars.",
    ],
    watch: [
      "Green progress bars mean the session completed, not necessarily that every order posted correctly.",
      "The bridge can check website orders and customers through a separate read connection while product and inventory changes remain disabled. A successful connection check does not prove that QuickBooks received an order or payment. If reads fail, ask the sync operator to check the read connection; do not enable broader writes or requeue payments to fix it.",
      "Tax uses its own QuickBooks item selected from the order address. Product ListIDs do not fix a missing or wrong tax item.",
      "If a taxed order is blocked before QuickBooks, check the order ZIP, county, tax rate, and whether the matching QuickBooks sales-tax item was imported.",
      "A row can be waiting for Web Connector without being broken. A stuck or error row has a reason and should be fixed or deliberately requeued.",
      "Canceled before QuickBooks sync can be skipped; canceled after posting should create a Web Connector sales-order close task.",
      "Catch-weight orders should post to QuickBooks as estimated sales orders when placed. Card orders post finalized invoices only after the final Stripe charge succeeds; approved pay-by-invoice orders post the finalized unpaid invoice when staff releases them.",
      "Signup-only storefront accounts should not appear in QuickBooks. If one does, treat it as a sync policy bug.",
      "Do not delete QuickBooks customer records for account deletion requests. If cleanup is needed, escalate for staff-only inactive or notes handling after open orders, refunds, payment holds, and accounting tasks are clear.",
      "Stripe refunds should create a Web Connector refund or credit-memo accounting task and then mark the Medusa order metadata when posted.",
      "Do not make speculative changes to QWC files, secrets, or QuickBooks item mappings.",
    ],
  },
  {
    id: "analytics",
    eyebrow: "Measurement",
    title: "Analytics, experiments, reviews, and newsletters",
    summary:
      "Analytics and email preference systems help measure the site and follow up with customers. They should not be treated as the order source of truth.",
    useFor: [
      "Server-side purchase tracking from Medusa order.placed.",
      "Jitsu/first-party events such as page viewed, product viewed, cart viewed, checkout started, shipping submitted, payment submitted, and order completed.",
      "First-party lifecycle ingestion for profile, segment, flow, and campaign decisions.",
      "ClickHouse event storage and GA4 dual-write for reporting parity.",
      "Email attribution for last-click or last-touch lifecycle and campaign revenue.",
      "Statsig experiments for homepage ordering, PDP facts, PDP recommendations, cart upsells, navigation, PLP, search, collections, recipes, learn, newsletter, SEO/GEO copy, and reviews/proof.",
      "Review acquisition emails after orders.",
      "Newsletter subscribe, unsubscribe, and email preference links.",
      "Public agentic-commerce product feed and manifest.",
    ],
    howTo: [
      "Use analytics to understand customer behavior, not to decide whether a customer paid.",
      "Use Medusa and Stripe for order/payment truth.",
      "Storefront events dual-write to first-party communications ingestion when the communications endpoint is configured.",
      "Use Customer Communications reports for lifecycle and email performance. Use Medusa and Stripe for order and payment truth.",
      "When changing checkout or purchase logic, make sure order_completed still originates server-side from order.placed.",
      "Use first-party Jitsu experiment reports for winner calls. GA4 can be a secondary check, but should not be the only decision source.",
      "Revenue experiments should stay paused unless purchase tracking and parity gates are healthy.",
      "Read the latest completed analytics comparison, including its dates and source availability. A running reporting service alone does not prove that Medusa, first-party events, GA4, and QuickBooks were compared.",
      "Compare the same order IDs and placement estimates. Final weighed charges and QuickBooks invoices are separate amounts; ask the analytics owner to investigate a missing order or amount difference before increasing campaign spend.",
      "For content-driven experiments, create draft Strapi experiment, variant, and placement records before activation.",
      "Use the email preferences page when a customer asks to manage newsletter email.",
      "Use review links and review-click tracking for post-purchase follow-up.",
    ],
    watch: [
      "Do not fire purchase events from the confirmation page client as the source of truth.",
      "Do not replace first-party eventing with GA4-only logic.",
      "Experiment variants must not hide broken purchase tracking.",
      "Unavailable means the comparison could not be completed; it does not mean zero sales or a passed launch check. Keep acquisition and revenue experiments on hold until the missing source and the comparison are verified.",
      "Purchase events currently tied to a later final charge may disagree with a placement-estimate report. Do not treat that difference as a customer payment failure or change accounting records to make an analytics report match.",
      "Do not put internal strategy language, QuickBooks ListIDs, or operational notes in customer-facing experiment content.",
      "If a variant changes the shopping path, verify cart, checkout, PDP, and mobile before turning on traffic.",
    ],
  },
  {
    id: "gp-quick",
    eyebrow: "Internal tools",
    title: "GP Quick internal tools (Quick Pages)",
    summary:
      "GP Quick is a private hub for small internal web tools built for the team: dashboards, calculators, and one-off helpers. Anyone on staff can use them, but only signed-in Grillers Pride staff can see them. New tools can be stood up in minutes, so reach for it instead of a spreadsheet, a screenshot, or a one-off doc.",
    useFor: [
      "Internal dashboards, calculators, and reference tools that are staff-only and do not belong on the customer site.",
      "Sharing a working prototype or tool with the team instead of an image or a document.",
      "Quick helpers that a spreadsheet or a one-off page would otherwise handle.",
    ],
    howTo: [
      "Go to gpq.aviswerdlow.com. This address is temporary while grillerspride.com is being moved over; the tools and your login carry to the permanent address with no change to how you use them.",
      "Sign in with your Grillers Pride email. Cloudflare Access emails you a one-time code; enter it to get in. Only allow-listed staff can reach the tools, so do not treat the link as a way around that.",
      "The home page lists the available tools. Open one and use it. Each tool is shared across the team, so notes or data a tool saves are visible to all staff, not just you.",
      "To get a new tool, ask Avi or describe what you want in plain language; a working tool can be built and published to GP Quick in minutes.",
    ],
    watch: [
      "GP Quick is internal only. The login gate keeps it private, but do not post the link or a tool's contents outside the team.",
      "Tools are lightweight and can be experimental. Double-check anything that feeds a customer-facing or money decision against the systems of record (Medusa, Stripe, QuickBooks).",
      "Saved data in a tool is shared, not per-person. Do not store customer personal data, card numbers, or secrets there.",
    ],
  },
]

const playbooks: Playbook[] = [
  {
    title: "A customer says a product is unavailable",
    steps: [
      "Open the product page and confirm what the customer sees.",
      "Check whether the item is active, seasonal inactive, discontinued, or internal only.",
      "If active and out of stock, offer the waitlist or a replacement.",
      "If seasonal inactive, explain that it is not currently offered and should not be treated as a normal back-in-stock item.",
      "If the status looks wrong, check Strapi lifecycle fields and Medusa inventory quantity before changing anything.",
    ],
  },
  {
    title: "A customer wants a refund",
    steps: [
      "Open Order Support and find the order.",
      "Confirm the payment is a refundable Stripe card payment.",
      "Record the customer consent method, reason, and internal note.",
      "Preview the refund, type REFUND, and apply it.",
      "Verify Medusa payment state, Stripe refund state, refund email, QBD writer task, and final QuickBooks posting status separately.",
    ],
  },
  {
    title: "A catch-weight order is ready to ship",
    steps: [
      "Open Pack & Finalize and select the order.",
      "Confirm every per-lb line has actual weight and every line has a QBD ListID or approved accounting resolution.",
      "For substituted lines, confirm the replacement product, replacement QBD ListID, and substitution reason are saved.",
      "Click Mark Ready to Charge after the final total is correct.",
      "Click Charge Card & Release only when the order is actually ready to leave.",
      "If Stripe succeeds, click Mark Fulfilled when the order physically leaves or is handed off.",
      "After fulfillment, check QuickBooks posting status after Web Connector runs.",
      "If Stripe fails, hold the order and contact the customer for updated payment before shipment.",
    ],
  },
  {
    title: "Peter cannot find a new order in QuickBooks",
    steps: [
      "Find the order in Medusa or Order Support first. If Medusa does not have the order, checkout did not complete.",
      "If Medusa has the order, confirm it is a placed order and not only a cart or checkout attempt.",
      "Open Staff Console > Synchronization Status and search by order number, customer email, ZIP, tax item, or error text.",
      "If the Web Connector warning banner is visible, resolve the credential/authentication issue before retrying order rows.",
      "If the row is waiting, run or wait for Web Connector. If the row is stuck or error, read the reason before changing anything.",
      "If Synchronization Status does not show the order at all, the backend-to-sync handoff failed or is not configured.",
      "If the order is blocked, check customer/address data, missing QBD ListIDs, Peter's invoice-template configuration, the Subtotal item, native sales-tax item resolution for the destination ZIP, shipping item config, discount item config, or invalid line amounts.",
      "After the cause is fixed, click Retry from Synchronization Status. Then run or wait for Web Connector and confirm the row changes to synced or shows a new clear error.",
      "Before final charge, expect a QuickBooks Sales Order, not an Invoice. After Charge Card & Release, expect one writer run for the finalized Invoice and a following run for the payment applied to that Invoice.",
      "If Stripe charged successfully but QuickBooks has no final Invoice, check the QBD Invoice writer job and Web Connector staff-action step before assuming the card charge failed. If the Invoice exists but is not Paid, check the following Receive Payment writer job.",
    ],
  },
  {
    title: "A customer wants to cancel",
    steps: [
      "Open Order Support and check fulfillment state first.",
      "If fulfillment has not started, choose Cancel, record consent, preview, type CANCEL, and apply.",
      "If fulfillment is locked or shipped, record a note and route to operations for credit, refund, or shipment handling.",
      "Verify cancellation email. If the order already posted to QuickBooks, verify the QBD writer close task and the next Web Connector result.",
    ],
  },
  {
    title: "QuickBooks Web Connector shows an error",
    steps: [
      "Open Last Result or the Web Connector log. Do not rely only on the green bar.",
      "Open Synchronization Status and filter to Stuck or Errors. Search the order number if Peter has a specific missing order.",
      "If the error says QuickBooks could not parse XML, inspect the generated QBXML request in sync logs and compare it with the row's recorded failure reason.",
      "Check missing product mappings, missing tax item config, missing shipping/discount item config, and invalid line amounts.",
      "Click Retry only for the affected order and only after you know the failure reason has been fixed.",
      "After the next Web Connector run, confirm the order has a QuickBooks transaction id or a clear remaining error.",
    ],
  },
  {
    title: "A product name is wrong in an email",
    steps: [
      "Compare the email row to the storefront PDP and Strapi product title.",
      "If the email shows a QuickBooks title or seasonal prefix, treat it as a customer-facing bug.",
      "Check whether the email template is reading line item title, product_title, Strapi title map, or QuickBooks history fields.",
      "Use SKU as subtext only. Do not expose ListID or item hex.",
      "Use Customer Communications to inspect the message log and send a corrected customer-safe note if the wrong email caused confusion.",
    ],
  },
  {
    title: "A staff member needs access",
    steps: [
      "A super admin opens Staff Console and chooses Team Access.",
      "Search the customer account by email, name, or phone.",
      "During the staged staff-access rollout, existing administrator access and order preparation remain available. The launch owner will enable the reviewed permissions only after integration credentials and a separate recovery login are verified.",
      "If staff order preparation reports an access or service error, stop and ask the administrator to resolve it. Do not use another person's login or a customer checkout to bypass the staff workflow.",
      "Change staff access in Team Access. Customer profile and contact forms cannot grant staff roles, final-charge permission, or clear a staff revocation.",
      "Choose staff or super admin, enter a clear reason, and type the confirmation word.",
      "Turn on Can charge final orders only for staff trusted to press Charge Card & Release. Super admins always have this permission.",
      "Helping with another customer's saved cards requires office access, such as Office, Manager, General staff, or Super admin. Picker, Packer, and Merchandising reviewer roles do not have this access; final-charge permission does not add it. Revoked accounts are refused by these saved-card tools.",
      "Initial administrator access is tied to the approved account identity. Another super admin can change or revoke it in Team Access with a reason and confirmation. You cannot remove your own super admin access.",
      "Every staff access change requires the affected person to sign in again. Old sessions cannot regain staff powers by refreshing or after access is restored. The server checks current permissions for privileged actions.",
      "If every storefront administrator is locked out, the separately configured recovery administrator must use the audited staff-access action. Record the reason and verify the restored account with a fresh sign-in; do not edit role metadata directly.",
      "Ask the new staff member to sign in and confirm the Staff nav item appears.",
    ],
  },
  {
    title: "An experiment is ready to activate",
    steps: [
      "Confirm the control is the current production experience and the variant is approved for customers.",
      "If the experiment affects revenue, confirm purchase tracking and first-party Jitsu reporting are healthy before sending traffic.",
      "For content-driven variants, confirm the Strapi experiment, variant, and placement records are published only when ready.",
      "Activate assignment in Statsig or the approved environment flag. Do not use QA force flags for live customer allocation.",
      "Check the storefront on desktop and mobile, then confirm experiment_exposed events and downstream cart/order events carry the experiment context.",
      "To stop the test, pause assignment first. To ship a winner, freeze allocation, verify guardrails, set the winner as default, and remove losing variant references through normal review.",
    ],
  },
]

function AnchorNav() {
  return (
    <nav className="grid gap-2 text-sm font-maison-neue md:grid-cols-2 xl:grid-cols-3">
      {sections.map((section) => (
        <a
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-Charcoal/70 transition hover:border-Gold/60 hover:text-Charcoal"
          href={`#${section.id}`}
          key={section.id}
        >
          {section.title}
        </a>
      ))}
    </nav>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-relaxed text-Charcoal/72">
      {items.map((item) => (
        <li className="flex gap-2" key={item}>
          <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-Gold" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2 text-sm leading-relaxed text-Charcoal/72">
      {items.map((item, index) => (
        <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-2" key={item}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-Gold/50 bg-Gold/10 text-xs font-maison-neue-mono text-Charcoal">
            {index + 1}
          </span>
          <span className="pt-1">{item}</span>
        </li>
      ))}
    </ol>
  )
}

function GuideBlock({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-maison-neue-mono uppercase text-Charcoal/50">
        {title}
      </h3>
      {children}
    </div>
  )
}

export default function StaffOperationsGuide() {
  return (
    <div className="bg-white">
      <section className="border-b border-gray-200 pb-8">
        <div className="flex flex-col gap-5 large:flex-row large:items-start large:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-maison-neue-mono uppercase text-Gold">
              Staff operations
            </p>
            <h1 className="mt-2 text-h2-mobile font-gyst font-bold leading-tight text-Charcoal md:text-h2">
              Griller&apos;s Pride site operating guide
            </h1>
            <p className="mt-4 text-base leading-relaxed font-maison-neue text-Charcoal/68">
              This guide explains how Peter and staff should operate the new
              site in plain language. It covers the customer site, staff
              console, checkout, inventory, emails, Strapi, Medusa, Stripe, and
              QuickBooks.
            </p>
          </div>
          <LocalizedClientLink
            href="/account/staff/orders"
            className="inline-flex min-h-[44px] w-fit items-center justify-center rounded-md border border-Charcoal px-4 text-sm font-rexton font-bold uppercase text-Charcoal transition hover:bg-Charcoal hover:text-white"
          >
            Staff Console
          </LocalizedClientLink>
        </div>
      </section>

      <section className="border-b border-gray-200 py-8">
        <h2 className="mb-4 text-xl font-gyst font-bold text-Charcoal">
          Quick map of the systems
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {systemMap.map((system) => (
            <div
              className="rounded-md border border-gray-200 bg-SilverPlate/20 p-4"
              key={system.name}
            >
              <div className="flex flex-col gap-1 small:flex-row small:items-baseline small:justify-between">
                <h3 className="text-base font-maison-neue font-semibold text-Charcoal">
                  {system.name}
                </h3>
                <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                  {system.owner}
                </p>
              </div>
              <p className="mt-2 text-sm leading-relaxed font-maison-neue text-Charcoal/65">
                {system.details}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-gray-200 py-8">
        <h2 className="mb-4 text-xl font-gyst font-bold text-Charcoal">
          Site surface reference
        </h2>
        <div className="overflow-hidden rounded-md border border-gray-200">
          <div className="hidden grid-cols-[220px_220px_minmax(0,1fr)] border-b border-gray-200 bg-SilverPlate/40 px-4 py-3 text-xs font-maison-neue-mono uppercase text-Charcoal/45 md:grid">
            <span>Route</span>
            <span>Surface</span>
            <span>Staff use</span>
          </div>
          <div className="divide-y divide-gray-100">
            {publicSurfaces.map((surface) => (
              <div
                className="grid gap-2 px-4 py-4 text-sm font-maison-neue md:grid-cols-[220px_220px_minmax(0,1fr)]"
                key={`${surface.route}-${surface.name}`}
              >
                <code className="break-words rounded bg-SilverPlate/35 px-2 py-1 text-xs text-Charcoal">
                  {surface.route}
                </code>
                <span className="font-semibold text-Charcoal">
                  {surface.name}
                </span>
                <span className="leading-relaxed text-Charcoal/68">
                  {surface.staffUse}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-gray-200 py-8">
        <h2 className="mb-4 text-xl font-gyst font-bold text-Charcoal">
          Daily operating checklist
        </h2>
        <NumberedList items={dailyChecklist} />
      </section>

      <section className="border-b border-gray-200 py-8">
        <h2 className="mb-4 text-xl font-gyst font-bold text-Charcoal">
          Jump to a section
        </h2>
        <AnchorNav />
      </section>

      <div className="divide-y divide-gray-200">
        {sections.map((section) => (
          <section
            className="scroll-mt-24 py-9"
            id={section.id}
            key={section.id}
          >
            <div className="mb-6 max-w-3xl">
              <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                {section.eyebrow}
              </p>
              <h2 className="mt-2 text-2xl font-gyst font-bold text-Charcoal">
                {section.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed font-maison-neue text-Charcoal/65">
                {section.summary}
              </p>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <GuideBlock title="Use this for">
                <BulletList items={section.useFor} />
              </GuideBlock>
              <GuideBlock title="How to operate it">
                <NumberedList items={section.howTo} />
              </GuideBlock>
              <GuideBlock title="Watch for">
                <BulletList items={section.watch} />
              </GuideBlock>
            </div>
          </section>
        ))}
      </div>

      <section className="border-t border-gray-200 py-9">
        <div className="mb-6 max-w-3xl">
          <p className="text-xs font-maison-neue-mono uppercase text-Gold">
            Playbooks
          </p>
          <h2 className="mt-2 text-2xl font-gyst font-bold text-Charcoal">
            Common staff situations
          </h2>
          <p className="mt-3 text-sm leading-relaxed font-maison-neue text-Charcoal/65">
            Use these when a customer calls or when staff see something that
            needs action. They are intentionally practical and conservative.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {playbooks.map((playbook) => (
            <section
              className="rounded-md border border-gray-200 bg-white p-5"
              key={playbook.title}
            >
              <h3 className="mb-4 text-lg font-gyst font-bold text-Charcoal">
                {playbook.title}
              </h3>
              <NumberedList items={playbook.steps} />
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
