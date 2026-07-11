"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import type { HttpTypes } from "@medusajs/types"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  BadgeDollarSign,
  BookOpenText,
  ClipboardList,
  DatabaseZap,
  Images,
  MessageSquare,
  NotebookPen,
  PackageCheck,
  ShieldCheck,
  UserPlus,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react"
import Button from "@modules/common/components/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { getStripePublishableKey } from "@lib/util/stripe-key"
import {
  applyStaffCustomerAccountAction,
  completeStaffPhoneOrder,
  createStaffCustomer,
  getStaffCustomerContext,
  getStaffLegacyOrderContext,
  prepareStaffPhoneOrder,
  searchStaffCustomers,
  searchStaffProducts,
  saveStaffCustomerAddress,
  updateStaffCustomerProfile,
  type StaffAddressInput,
  type StaffCompleteOrderResult,
  type StaffCustomerContext,
  type StaffCustomerSummary,
  type StaffOrderLineInput,
  type StaffPaymentMode,
  type StaffPrepareOrderResult,
  type StaffProductSearchResult,
} from "@lib/data/staff/order-entry"
import {
  STAFF_CUSTOMER_ACCOUNT_REASON_OPTIONS,
  staffCustomerAccountReasonLabel,
  type StaffCustomerAccountReasonCode,
} from "@lib/data/staff/customer-account-ledger"
import {
  canChargeFinalOrders,
  canManageOrderSupport,
  canPackCatchWeightOrders,
  canPickCatchWeightOrders,
  canReviewMerchandising,
  canUseOfficeConsole,
  isSuperAdminCustomer,
  staffAccessRole,
} from "@lib/util/staff-access"
import {
  startStaffImpersonation,
  stopStaffImpersonation,
} from "@lib/data/staff/impersonation"
import type { StaffImpersonationSession } from "@lib/data/staff/impersonation-types"
import { dispatchStorefrontSessionUpdated } from "@lib/util/storefront-session-events"
import StaffOrderExceptionConsole from "@modules/staff/components/order-exception-console"
import StaffTeamAccessConsole from "@modules/staff/components/team-access-console"
import StaffCatchWeightFinalizationConsole from "@modules/staff/components/catch-weight-finalization-console"
import StaffQuickBooksSyncStatusConsole from "@modules/staff/components/quickbooks-sync-status-console"
import StaffMerchandisingWorkspace from "@modules/staff/components/merchandising-workspace"
import type { ProductMerchandisingTagSummary } from "@lib/data/staff/product-merchandising"

type Props = {
  countryCode: string
  staffCustomer: HttpTypes.StoreCustomer
  initialImpersonation: StaffImpersonationSession | null
  initialMerchandisingError?: string | null
  initialMerchandisingTags?: ProductMerchandisingTagSummary[] | null
  initialWorkspace?: StaffWorkspace
}

export type StaffWorkspace =
  | "phone_order"
  | "new_customer"
  | "customer_account"
  | "finalization"
  | "exceptions"
  | "quickbooks_sync"
  | "team_access"
  | "merchandising"

type StaffWorkspaceAction = {
  id: StaffWorkspace | "communications"
  eyebrow: string
  title: string
  body: string
  icon: LucideIcon
  href?: string
  onClick?: () => void
}

const stripeKey = getStripePublishableKey()
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

type DraftCustomer = {
  id?: string
  email: string
  firstName: string
  lastName: string
  phone: string
  company: string
  qbdCustomerType: string
  alternateContactName: string
  alternateContactPhone: string
  alternateContactPhoneType: "" | "mobile" | "landline"
}

const qbdCustomerTypeOptions = [
  { value: "", label: "Not set" },
  { value: "Local", label: "Local" },
  { value: "Shipping", label: "Shipping" },
  { value: "PlantPickup", label: "Plant pickup" },
  { value: "RouteMemphis", label: "Route Memphis" },
  { value: "RouteNashville", label: "Route Nashville" },
  { value: "RouteChattanooga", label: "Route Chattanooga" },
  { value: "RouteBirmingham", label: "Route Birmingham" },
]

type CustomerAccountActionKind = "customer_note" | "customer_credit"

const emptyAddress: StaffAddressInput = {
  firstName: "",
  lastName: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  province: "",
  postalCode: "",
  countryCode: "us",
  phone: "",
}

function draftFromCustomer(customer: StaffCustomerSummary): DraftCustomer {
  return {
    id: isSyntheticCustomerId(customer.id) ? undefined : customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    company: customer.company,
    qbdCustomerType: customer.qbdCustomerType || "",
    alternateContactName: customer.alternateContactName || "",
    alternateContactPhone: customer.alternateContactPhone || "",
    alternateContactPhoneType: customer.alternateContactPhoneType || "",
  }
}

function addressFromCustomer(
  customer: StaffCustomerSummary
): StaffAddressInput {
  return customer.defaultAddress
    ? { ...emptyAddress, ...customer.defaultAddress }
    : {
        ...emptyAddress,
        firstName: customer.firstName,
        lastName: customer.lastName,
        company: customer.company,
        phone: customer.phone,
      }
}

function isSyntheticCustomerId(id?: string) {
  return Boolean(id?.startsWith("order:") || id?.startsWith("legacy-order:"))
}

function legacySyntheticOrderId(customer: StaffCustomerSummary) {
  if (customer.matchedLegacyOrderId) return customer.matchedLegacyOrderId
  if (customer.id?.startsWith("legacy-order:")) {
    return customer.id.slice("legacy-order:".length)
  }
  return ""
}

function formatPrice(value?: number, currencyCode = "usd") {
  if (typeof value !== "number") return "Price unavailable"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(value)
}

function formatDate(value?: string) {
  if (!value) return "Unknown date"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function sourceLabel(source: StaffCustomerSummary["source"]) {
  if (source === "legacy_order") return "Legacy order"
  if (source === "order") return "Order"
  return "Customer"
}

function fieldClass() {
  return "min-h-[44px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-maison-neue text-Charcoal outline-none transition focus:border-Gold focus:ring-1 focus:ring-Gold disabled:cursor-not-allowed disabled:bg-SilverPlate/40 disabled:text-Charcoal/40"
}

function labelClass() {
  return "text-xs font-maison-neue-mono uppercase text-Charcoal/55"
}

function availabilityBadge(product?: StaffProductSearchResult["availability"]) {
  if (!product)
    return {
      label: "Checking",
      className: "border-gray-200 bg-gray-50 text-Charcoal/55",
    }
  if (product.decision === "available") {
    return {
      label: `${product.available_to_promise_quantity} ATP`,
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    }
  }
  if (product.decision === "future_allowed") {
    return {
      label: "Future",
      className: "border-blue-200 bg-blue-50 text-blue-800",
    }
  }
  if (product.decision === "partial") {
    return {
      label: `${product.available_to_promise_quantity} ATP`,
      className: "border-amber-200 bg-amber-50 text-amber-800",
    }
  }
  return {
    label: product.decision === "inactive" ? "Inactive" : "Blocked",
    className: "border-red-200 bg-red-50 text-red-800",
  }
}

function staffLineNeedsOverride(line: StaffOrderLineInput) {
  const decision = line.availability?.decision
  return decision === "partial" || decision === "blocked"
}

function StaffChargeCard({
  result,
  billingAddress,
  onComplete,
}: {
  result: StaffPrepareOrderResult
  billingAddress: StaffAddressInput
  onComplete: (result: StaffCompleteOrderResult) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [cardComplete, setCardComplete] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const [isCharging, startTransition] = useTransition()

  function chargeCard() {
    if (!stripe || !elements || !result.paymentClientSecret || !result.cartId) {
      setCardError("Payment form is not ready.")
      return
    }

    const card = elements.getElement(CardElement)
    if (!card) {
      setCardError("Card field is not ready.")
      return
    }

    startTransition(async () => {
      const payment = await stripe.confirmCardPayment(
        result.paymentClientSecret!,
        {
          payment_method: {
            card,
            billing_details: {
              name: [billingAddress.firstName, billingAddress.lastName]
                .filter(Boolean)
                .join(" "),
              email: result.cart?.email || undefined,
              phone: billingAddress.phone || undefined,
              address: {
                line1: billingAddress.address1 || undefined,
                line2: billingAddress.address2 || undefined,
                city: billingAddress.city || undefined,
                state: billingAddress.province || undefined,
                postal_code: billingAddress.postalCode || undefined,
                country: billingAddress.countryCode || undefined,
              },
            },
          },
        }
      )

      if (payment.error) {
        setCardError(
          payment.error.message || "Stripe could not authorize the card."
        )
        return
      }

      onComplete(await completeStaffPhoneOrder(result.cartId!))
    })
  }

  return (
    <div className="mt-4 rounded-md border border-Gold/35 bg-Gold/10 p-4">
      <p className="mb-2 text-sm font-maison-neue font-semibold text-Charcoal">
        Card collection
      </p>
      <div className="rounded-md border border-gray-200 bg-white px-3 py-3">
        <CardElement
          onChange={(event) => {
            setCardComplete(event.complete)
            setCardError(event.error?.message || null)
          }}
        />
      </div>
      {cardError && (
        <p className="mt-2 text-sm font-maison-neue text-red-700">
          {cardError}
        </p>
      )}
      <Button
        className="mt-3 min-h-[44px] w-full rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white"
        disabled={!cardComplete || isCharging}
        isLoading={isCharging}
        onClick={chargeCard}
        type="button"
      >
        Charge Card and Place Order
      </Button>
    </div>
  )
}

export default function PhoneOrderCopilot({
  countryCode,
  staffCustomer,
  initialImpersonation,
  initialMerchandisingError = null,
  initialMerchandisingTags = null,
  initialWorkspace = "phone_order",
}: Props) {
  const router = useRouter()
  const [customerQuery, setCustomerQuery] = useState("")
  const [customerResults, setCustomerResults] = useState<
    StaffCustomerSummary[]
  >([])
  const [isCustomerSearchPending, setIsCustomerSearchPending] = useState(false)
  const [lastCustomerSearchQuery, setLastCustomerSearchQuery] = useState("")
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(
    null
  )
  const customerSearchRequestId = useRef(0)
  const [selectedContext, setSelectedContext] =
    useState<StaffCustomerContext | null>(null)
  const [draftCustomer, setDraftCustomer] = useState<DraftCustomer>({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    company: "",
    qbdCustomerType: "",
    alternateContactName: "",
    alternateContactPhone: "",
    alternateContactPhoneType: "",
  })
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [sendAccountInvite, setSendAccountInvite] = useState(true)
  const [shippingAddress, setShippingAddress] =
    useState<StaffAddressInput>(emptyAddress)
  const [sameAsShipping, setSameAsShipping] = useState(true)
  const [customerVerified, setCustomerVerified] = useState(false)
  const [productQuery, setProductQuery] = useState("")
  const [productResults, setProductResults] = useState<
    StaffProductSearchResult[]
  >([])
  const [lines, setLines] = useState<StaffOrderLineInput[]>([])
  const [fulfillmentType, setFulfillmentType] = useState<
    "plant_pickup" | "atlanta_delivery" | "ups_shipping" | "southeast_pickup"
  >("plant_pickup")
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTimeWindow, setScheduledTimeWindow] = useState("")
  const [paymentMode, setPaymentMode] =
    useState<StaffPaymentMode>("collect_card_now")
  const [paymentConsent, setPaymentConsent] = useState(false)
  const [sendConfirmation, setSendConfirmation] = useState(true)
  const [orderNotes, setOrderNotes] = useState("")
  const [substitutionPreference, setSubstitutionPreference] = useState("")
  const [deliveryInstructions, setDeliveryInstructions] = useState("")
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [prepareResult, setPrepareResult] =
    useState<StaffPrepareOrderResult | null>(null)
  const [completeResult, setCompleteResult] =
    useState<StaffCompleteOrderResult | null>(null)
  const [impersonation, setImpersonation] =
    useState<StaffImpersonationSession | null>(initialImpersonation)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [activeWorkspace, setActiveWorkspace] =
    useState<StaffWorkspace>(initialWorkspace)
  const [customerAccountAction, setCustomerAccountAction] =
    useState<CustomerAccountActionKind>("customer_note")
  const [customerAccountAmount, setCustomerAccountAmount] = useState("")
  const [customerAccountReason, setCustomerAccountReason] =
    useState<StaffCustomerAccountReasonCode>("goodwill")
  const [customerAccountRelatedOrder, setCustomerAccountRelatedOrder] =
    useState("")
  const [customerAccountStaffNote, setCustomerAccountStaffNote] = useState("")
  const [customerAccountVisibleNote, setCustomerAccountVisibleNote] =
    useState("")
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectWorkspace = useCallback(
    (workspace: StaffWorkspace) => {
      setActiveWorkspace(workspace)
      const nextParams = new URLSearchParams(searchParams.toString())
      nextParams.set("workspace", workspace)
      const query = nextParams.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router, searchParams]
  )
  useEffect(() => {
    setActiveWorkspace(initialWorkspace)
  }, [initialWorkspace])
  const canManageTeamAccess = isSuperAdminCustomer(staffCustomer)
  const staffRole = staffAccessRole(staffCustomer)
  const canChargeFinalizedOrders = canChargeFinalOrders(staffCustomer)
  const canUseOffice = canUseOfficeConsole(staffCustomer)
  const canUseOrderSupport = canManageOrderSupport(staffCustomer)
  const canUsePickQueue = canPickCatchWeightOrders(staffCustomer)
  const canUsePackQueue = canPackCatchWeightOrders(staffCustomer)
  const canReviewMerch = canReviewMerchandising(staffCustomer)
  const isCustomerWorkspace =
    activeWorkspace === "phone_order" || activeWorkspace === "new_customer"
  const hasSelectedCustomer = Boolean(draftCustomer.id)
  const hasOrderLines = lines.length > 0
  const canEditShippingAddress = hasSelectedCustomer
  const canEditOrderControls = hasSelectedCustomer && hasOrderLines
  const hasUnresolvedStaffBlocks = lines.some(
    (line) =>
      staffLineNeedsOverride(line) &&
      (!line.overrideReason?.trim() || !line.overrideNote?.trim())
  )
  const prepareDisabled =
    !hasSelectedCustomer ||
    !hasOrderLines ||
    !customerVerified ||
    hasUnresolvedStaffBlocks ||
    (paymentMode === "collect_card_now" && !paymentConsent)
  const customerAccountActionDisabled =
    !draftCustomer.id ||
    !customerAccountStaffNote.trim() ||
    (customerAccountAction === "customer_credit" &&
      (!Number.isFinite(Number(customerAccountAmount)) ||
        Number(customerAccountAmount) <= 0))

  const staffName = useMemo(
    () =>
      [staffCustomer.first_name, staffCustomer.last_name]
        .filter(Boolean)
        .join(" ") || staffCustomer.email,
    [staffCustomer]
  )

  const customerAccountOrderOptions = useMemo(() => {
    if (!selectedContext) return []

    const medusaOrders = (selectedContext.recentOrders || []).map((order) => ({
      value: `medusa:${order.id}`,
      id: order.id,
      displayId: order.displayId,
      label: `${order.displayId} | ${formatDate(order.createdAt)}`,
    }))

    const legacyOrders = (selectedContext.legacyOrders || []).map((order) => ({
      value: `legacy:${order.id}`,
      id: order.id,
      displayId: order.displayId,
      label: `${order.displayId} | ${formatDate(order.placedAt)}`,
    }))

    return [...medusaOrders, ...legacyOrders]
  }, [selectedContext])

  function updateDraftCustomer(patch: Partial<DraftCustomer>) {
    setDraftCustomer((current) => ({ ...current, ...patch }))
  }

  function qbdCustomerTypeSelectOptions() {
    if (
      !draftCustomer.qbdCustomerType ||
      qbdCustomerTypeOptions.some(
        (option) => option.value === draftCustomer.qbdCustomerType
      )
    ) {
      return qbdCustomerTypeOptions
    }

    return [
      ...qbdCustomerTypeOptions,
      {
        value: draftCustomer.qbdCustomerType,
        label: `Existing: ${draftCustomer.qbdCustomerType}`,
      },
    ]
  }

  function renderQuickBooksCustomerFields() {
    return (
      <>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className={labelClass()}>QB customer type</span>
          <select
            className={fieldClass()}
            value={draftCustomer.qbdCustomerType}
            onChange={(event) =>
              updateDraftCustomer({ qbdCustomerType: event.target.value })
            }
          >
            {qbdCustomerTypeSelectOptions().map((option) => (
              <option key={option.value || "none"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass()}>Alternate contact name</span>
          <input
            className={fieldClass()}
            value={draftCustomer.alternateContactName}
            onChange={(event) =>
              updateDraftCustomer({
                alternateContactName: event.target.value,
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass()}>Alternate contact number</span>
          <input
            className={fieldClass()}
            inputMode="tel"
            value={draftCustomer.alternateContactPhone}
            onChange={(event) =>
              updateDraftCustomer({
                alternateContactPhone: event.target.value,
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className={labelClass()}>Alternate number type</span>
          <select
            className={fieldClass()}
            value={draftCustomer.alternateContactPhoneType}
            onChange={(event) =>
              updateDraftCustomer({
                alternateContactPhoneType: event.target.value as
                  | ""
                  | "mobile"
                  | "landline",
              })
            }
          >
            <option value="">Select mobile or landline</option>
            <option value="mobile">Mobile</option>
            <option value="landline">Landline</option>
          </select>
        </label>
      </>
    )
  }

  function updateCustomerQuery(value: string) {
    setCustomerQuery(value)
    if (customerSearchError) setCustomerSearchError(null)
  }

  function updateShippingAddress(patch: Partial<StaffAddressInput>) {
    setShippingAddress((current) => ({ ...current, ...patch }))
  }

  function resetOrderDraft() {
    setProductQuery("")
    setProductResults([])
    setLines([])
    setFulfillmentType("plant_pickup")
    setScheduledDate("")
    setScheduledTimeWindow("")
    setPaymentMode("collect_card_now")
    setPaymentConsent(false)
    setSendConfirmation(true)
    setOrderNotes("")
    setSubstitutionPreference("")
    setDeliveryInstructions("")
    setCheckoutUrl(null)
    setPrepareResult(null)
    setCompleteResult(null)
  }

  function resetCustomerAccountAction() {
    setCustomerAccountAction("customer_note")
    setCustomerAccountAmount("")
    setCustomerAccountReason("goodwill")
    setCustomerAccountRelatedOrder("")
    setCustomerAccountStaffNote("")
    setCustomerAccountVisibleNote("")
  }

  function resetCustomerLookup() {
    customerSearchRequestId.current += 1
    setCustomerQuery("")
    setCustomerResults([])
    setIsCustomerSearchPending(false)
    setLastCustomerSearchQuery("")
    setCustomerSearchError(null)
  }

  async function activateCustomerContext(target: {
    id?: string
    email: string
    firstName: string
    lastName: string
  }): Promise<{
    ok: boolean
    error?: string
    session?: StaffImpersonationSession
  }> {
    if (!target.id) {
      return { ok: false, error: "Choose a storefront customer first." }
    }

    return startStaffImpersonation({
      targetCustomerId: target.id,
      targetEmail: target.email,
      targetName:
        [target.firstName, target.lastName].filter(Boolean).join(" ") ||
        target.email,
    })
  }

  async function runCustomerSearch() {
    const query = customerQuery.trim()
    const requestId = customerSearchRequestId.current + 1
    customerSearchRequestId.current = requestId
    setError(null)
    setStatus(null)
    setCustomerSearchError(null)
    setLastCustomerSearchQuery(query)
    setCustomerResults([])

    if (query.length < 2) {
      setCustomerSearchError("Enter at least 2 characters to search customers.")
      setIsCustomerSearchPending(false)
      return
    }

    setIsCustomerSearchPending(true)

    try {
      const results = await searchStaffCustomers(query)
      if (customerSearchRequestId.current !== requestId) return
      setCustomerResults(results)
    } catch (err) {
      if (customerSearchRequestId.current !== requestId) return
      const message = err instanceof Error ? err.message : String(err)
      setCustomerSearchError(message)
      setError(message)
    } finally {
      if (customerSearchRequestId.current === requestId) {
        setIsCustomerSearchPending(false)
      }
    }
  }

  function selectCustomer(
    customer: StaffCustomerSummary,
    options: { preserveStatus?: boolean; workspace?: StaffWorkspace } = {}
  ) {
    setError(null)
    setCustomerSearchError(null)
    if (!options.preserveStatus) setStatus(null)
    selectWorkspace(options.workspace || "phone_order")
    setShowNewCustomerForm(false)
    setIsCustomerSearchPending(false)
    setCheckoutUrl(null)
    resetCustomerAccountAction()
    setDraftCustomer(draftFromCustomer(customer))
    setShippingAddress(addressFromCustomer(customer))
    setCustomerVerified(false)
    if (isSyntheticCustomerId(customer.id)) {
      const legacyOrderId = legacySyntheticOrderId(customer)
      if (!legacyOrderId) {
        setSelectedContext(null)
        return
      }

      startTransition(async () => {
        try {
          const context = await getStaffLegacyOrderContext(legacyOrderId)
          setSelectedContext(context)
          setDraftCustomer(draftFromCustomer(context))
          setShippingAddress(addressFromCustomer(context))
        } catch (err) {
          setSelectedContext(null)
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      return
    }

    startTransition(async () => {
      try {
        const context = await getStaffCustomerContext(customer.id, {
          includeLegacyOrderId: customer.matchedLegacyOrderId,
        })
        setSelectedContext(context)
        setDraftCustomer(draftFromCustomer(context))
        setShippingAddress(addressFromCustomer(context))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  function renderCustomerSearchFeedback(className = "mt-4") {
    if (isCustomerSearchPending) {
      return (
        <p
          className={`${className} rounded-md border border-gray-200 bg-SilverPlate/35 px-3 py-3 text-sm font-maison-neue text-Charcoal/60`}
          role="status"
        >
          Searching customer records...
        </p>
      )
    }

    if (customerSearchError) {
      return (
        <p
          className={`${className} rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm font-maison-neue text-red-700`}
          role="alert"
        >
          {customerSearchError}
        </p>
      )
    }

    const hasFreshEmptySearch =
      lastCustomerSearchQuery &&
      customerQuery.trim() === lastCustomerSearchQuery &&
      customerResults.length === 0

    if (!hasFreshEmptySearch) return null

    return (
      <p
        className={`${className} rounded-md border border-gray-200 bg-SilverPlate/35 px-3 py-3 text-sm font-maison-neue text-Charcoal/60`}
        role="status"
      >
        No customers found for "{lastCustomerSearchQuery}". Try an email, phone
        number, or order number.
      </p>
    )
  }

  function createCustomer() {
    setError(null)
    setCheckoutUrl(null)
    startTransition(async () => {
      try {
        const customer = await createStaffCustomer({
          ...draftCustomer,
          sendAccountInvite,
          defaultAddress: {
            ...shippingAddress,
            firstName: shippingAddress.firstName || draftCustomer.firstName,
            lastName: shippingAddress.lastName || draftCustomer.lastName,
            company: shippingAddress.company || draftCustomer.company,
            phone: shippingAddress.phone || draftCustomer.phone,
            countryCode: shippingAddress.countryCode || countryCode || "us",
          },
        })
        setStatus(
          customer.accountClaimStatus === "reset_sent"
            ? "Customer profile created and account claim email sent."
            : customer.accountClaimStatus === "reset_send_failed"
            ? `Customer profile created, but the account claim email failed: ${
                customer.accountClaimMessage || "unknown"
              }`
            : "Customer profile created."
        )
        setShowNewCustomerForm(false)
        selectCustomer(customer, { preserveStatus: true })
        const contextResult = await activateCustomerContext(customer)
        if (!contextResult.ok || !contextResult.session) {
          setError(
            contextResult.error ||
              "Customer profile created, but customer context could not be activated."
          )
          return
        }
        setImpersonation(contextResult.session)
        dispatchStorefrontSessionUpdated({
          reason: "staff-impersonation-started",
        })
        setStatus(
          customer.accountClaimStatus === "reset_sent"
            ? `Customer profile created, account claim email sent, and context is active for ${contextResult.session.targetName}.`
            : `Customer profile created and context is active for ${contextResult.session.targetName}.`
        )
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  function startNewCustomer() {
    setError(null)
    setStatus(null)
    resetCustomerLookup()
    setSelectedContext(null)
    setDraftCustomer({
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      company: "",
      qbdCustomerType: "",
      alternateContactName: "",
      alternateContactPhone: "",
      alternateContactPhoneType: "",
    })
    setShippingAddress({
      ...emptyAddress,
      countryCode: countryCode || "us",
    })
    setCustomerVerified(false)
    setSendAccountInvite(true)
    resetCustomerAccountAction()
    resetOrderDraft()
    setShowNewCustomerForm(true)
  }

  function openCustomerContextWorkspace() {
    selectWorkspace("phone_order")
    resetCustomerLookup()
    setShowNewCustomerForm(false)
  }

  function openCustomerAccountWorkspace() {
    selectWorkspace("customer_account")
    resetCustomerLookup()
    setShowNewCustomerForm(false)
  }

  function openNewCustomerWorkspace() {
    selectWorkspace("new_customer")
    startNewCustomer()
  }

  function cancelNewCustomer() {
    setShowNewCustomerForm(false)
    if (activeWorkspace === "new_customer") {
      selectWorkspace("phone_order")
    }
  }

  function saveCustomerProfile() {
    if (!draftCustomer.id) return
    setError(null)
    startTransition(async () => {
      const result = await updateStaffCustomerProfile({
        customerId: draftCustomer.id!,
        ...draftCustomer,
      })
      if (!result.ok || !result.customer) {
        setError(result.error || "Could not save customer profile.")
        return
      }
      setSelectedContext(result.customer)
      setDraftCustomer(draftFromCustomer(result.customer))
      setStatus("Customer profile saved with staff audit metadata.")
    })
  }

  function saveCustomerAddress() {
    if (!draftCustomer.id) return
    setError(null)
    startTransition(async () => {
      const result = await saveStaffCustomerAddress({
        customerId: draftCustomer.id!,
        address: shippingAddress,
      })
      if (!result.ok || !result.customer) {
        setError(result.error || "Could not save customer address.")
        return
      }
      setSelectedContext(result.customer)
      setShippingAddress(addressFromCustomer(result.customer))
      setStatus("Customer address saved with staff audit metadata.")
    })
  }

  function recordCustomerAccountAction() {
    if (!draftCustomer.id) return
    const action = customerAccountAction
    const relatedOrder = customerAccountOrderOptions.find(
      (option) => option.value === customerAccountRelatedOrder
    )
    setError(null)
    startTransition(async () => {
      const result = await applyStaffCustomerAccountAction({
        customerId: draftCustomer.id!,
        action,
        amount:
          action === "customer_credit"
            ? Number(customerAccountAmount)
            : undefined,
        reasonCode: customerAccountReason,
        staffNote: customerAccountStaffNote,
        customerVisibleNote:
          action === "customer_credit" ? customerAccountVisibleNote : undefined,
        relatedOrderId: relatedOrder?.id,
        relatedOrderDisplayId: relatedOrder?.displayId,
      })

      if (!result.ok || !result.customer) {
        setError(result.error || "Could not record customer account action.")
        return
      }

      setSelectedContext(result.customer)
      resetCustomerAccountAction()
      setStatus(
        action === "customer_credit"
          ? "Customer credit recorded and queued for QuickBooks follow-up."
          : "Customer note recorded with staff audit metadata."
      )
    })
  }

  function beginImpersonation() {
    if (!draftCustomer.id) return
    setError(null)
    startTransition(async () => {
      const result = await activateCustomerContext(draftCustomer)
      if (!result.ok || !result.session) {
        setError(result.error || "Could not enter customer context.")
        return
      }
      setImpersonation(result.session)
      dispatchStorefrontSessionUpdated({
        reason: "staff-impersonation-started",
      })
      setStatus(`Now acting as ${result.session.targetName}.`)
      router.refresh()
    })
  }

  function endImpersonation() {
    startTransition(async () => {
      await stopStaffImpersonation()
      setImpersonation(null)
      dispatchStorefrontSessionUpdated({
        reason: "staff-impersonation-stopped",
      })
      setStatus("Exited customer context.")
      router.refresh()
    })
  }

  function runProductSearch() {
    setError(null)
    startTransition(async () => {
      try {
        const results = await searchStaffProducts(productQuery, countryCode, {
          fulfillmentType,
          scheduledDate,
        })
        setProductResults(results)
        if (!results.length) setStatus("No matching products found.")
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  function addProduct(product: StaffProductSearchResult) {
    setLines((current) => {
      const existing = current.find(
        (line) => line.variantId === product.variantId
      )
      if (existing) {
        return current.map((line) =>
          line.variantId === product.variantId
            ? { ...line, quantity: line.quantity + 1 }
            : line
        )
      }
      return [
        ...current,
        {
          variantId: product.variantId,
          quantity: 1,
          title:
            product.variantTitle && product.variantTitle !== "Default"
              ? `${product.title} - ${product.variantTitle}`
              : product.title,
          sku: product.sku,
          availability: product.availability,
        },
      ]
    })
  }

  function addLegacyItem(
    item: StaffCustomerContext["legacyOrders"][number]["items"][number]
  ) {
    if (!item.variantId) return

    const quantity = Math.max(1, Math.round(Number(item.quantity || 1)))
    setLines((current) => {
      const existing = current.find((line) => line.variantId === item.variantId)
      if (existing) {
        return current.map((line) =>
          line.variantId === item.variantId
            ? { ...line, quantity: line.quantity + quantity }
            : line
        )
      }

      return [
        ...current,
        {
          variantId: item.variantId!,
          quantity,
          title: item.title,
          sku: item.sku,
          source: "legacy_order_history",
          legacyPurchaseHistoryKey: item.purchaseHistoryKey,
          legacyOrderId: item.legacyOrderId,
          legacyOrderLineId: item.id,
        },
      ]
    })
  }

  function updateLineQuantity(variantId: string, quantity: number) {
    if (quantity <= 0) {
      setLines((current) =>
        current.filter((line) => line.variantId !== variantId)
      )
      return
    }
    setLines((current) =>
      current.map((line) =>
        line.variantId === variantId ? { ...line, quantity } : line
      )
    )
  }

  function updateLinePatch(
    variantId: string,
    patch: Partial<StaffOrderLineInput>
  ) {
    setLines((current) =>
      current.map((line) =>
        line.variantId === variantId ? { ...line, ...patch } : line
      )
    )
  }

  function prepareOrder() {
    setError(null)
    setStatus(null)
    setCheckoutUrl(null)
    setPrepareResult(null)
    setCompleteResult(null)
    startTransition(async () => {
      try {
        const result = await prepareStaffPhoneOrder({
          countryCode,
          customer: draftCustomer,
          shippingAddress,
          sameAsShipping,
          lines,
          fulfillmentType,
          scheduledDate,
          scheduledTimeWindow,
          customerVerified,
          paymentMode,
          paymentConsent,
          sendConfirmation,
          orderNotes,
          substitutionPreference,
          deliveryInstructions,
        })

        if (!result.ok) {
          throw new Error(result.error || "Could not prepare phone order.")
        }

        setPrepareResult(result)
        setCheckoutUrl(result.checkoutUrl || null)
        setStatus(
          paymentMode === "collect_card_now"
            ? "Payment session prepared. Enter the customer's card with consent."
            : result.confirmationSent
            ? "Checkout link prepared and emailed."
            : "Checkout link prepared."
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  const workspaceActions: StaffWorkspaceAction[] = [
    ...(canUseOrderSupport
      ? [
          {
            id: "exceptions" as const,
            eyebrow: "Existing orders",
            title: "Order support",
            body: "Look up orders for customer questions, payment state, cancellations, refunds, notes, and audited exceptions.",
            icon: ClipboardList,
            onClick: () => selectWorkspace("exceptions"),
          },
          {
            id: "quickbooks_sync" as const,
            eyebrow: "Admin tools",
            title: "Synchronization status",
            body: "See orders waiting for QuickBooks, stuck errors, Web Connector state, and recent sync logs.",
            icon: DatabaseZap,
            onClick: () => selectWorkspace("quickbooks_sync"),
          },
        ]
      : []),
    ...(canUsePickQueue || canUsePackQueue
      ? [
          {
            id: "finalization" as const,
            eyebrow: canUsePackQueue ? "Pick and pack" : "Picking",
            title: canUsePackQueue ? "Pick, pack & finalize" : "Pick orders",
            body: canUsePackQueue
              ? "Pick handoffs, packed counts, per-item weights, substitutions, boxes, coolers, and final release."
              : "Pick order lines, record shortages or substitutions, and hand ready orders to packing.",
            icon: PackageCheck,
            onClick: () => selectWorkspace("finalization"),
          },
        ]
      : []),
    ...(canUseOffice
      ? [
          {
            id: "phone_order" as const,
            eyebrow: "Customer context",
            title: "Enter account",
            body: "Impersonate a customer, shop, reorder, edit addresses, and check out through the storefront flow.",
            icon: UserRoundCheck,
            onClick: openCustomerContextWorkspace,
          },
          {
            id: "customer_account" as const,
            eyebrow: "Customer account",
            title: "Account actions",
            body: "Find a customer to record account-level notes or credits without entering their storefront session.",
            icon: BadgeDollarSign,
            onClick: openCustomerAccountWorkspace,
          },
          {
            id: "new_customer" as const,
            eyebrow: "New customer",
            title: "Create account",
            body: "Start a caller profile with contact and delivery details before continuing into order entry.",
            icon: UserPlus,
            onClick: openNewCustomerWorkspace,
          },
          {
            id: "communications" as const,
            eyebrow: "Customer messaging",
            title: "Communications",
            body: "Open timelines, approved staff notes, Postmark delivery, lifecycle flows, and campaigns.",
            icon: MessageSquare,
            href: "/account/staff/communications",
          },
        ]
      : []),
    ...(canReviewMerch
      ? [
          {
            id: "merchandising" as const,
            eyebrow: "Catalog",
            title: "Merchandising",
            body: "Review L3 product photo groups, track approval progress, and approve or reject product images.",
            icon: Images,
          },
        ]
      : []),
    ...(canManageTeamAccess
      ? [
          {
            id: "team_access" as const,
            eyebrow: "Super admin",
            title: "Team access",
            body: "Manage staff members, super admins, and every permission change audit record.",
            icon: ShieldCheck,
            onClick: () => selectWorkspace("team_access"),
          },
        ]
      : []),
  ]

  const activeWorkspaceAction = workspaceActions.find(
    (action) => action.id === activeWorkspace
  )
  const fallbackWorkspace = workspaceActions.find(
    (action): action is StaffWorkspaceAction & { id: StaffWorkspace } =>
      action.id !== "communications"
  )?.id

  useEffect(() => {
    if (!activeWorkspaceAction && fallbackWorkspace) {
      selectWorkspace(fallbackWorkspace)
    }
  }, [activeWorkspaceAction, fallbackWorkspace, selectWorkspace])

  useEffect(() => {
    if (
      activeWorkspace === "new_customer" &&
      !showNewCustomerForm &&
      !draftCustomer.id
    ) {
      setShowNewCustomerForm(true)
    }
  }, [activeWorkspace, draftCustomer.id, showNewCustomerForm])

  const workspaceItemClass =
    "group flex h-full min-h-[132px] w-full flex-col justify-between rounded-md border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-Gold focus:ring-offset-2"

  function renderWorkspaceAction(action: StaffWorkspaceAction) {
    const Icon = action.icon
    const isActive = action.id === activeWorkspace
    const content = (
      <>
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[11px] font-maison-neue-mono uppercase tracking-[0.08em] opacity-65">
              {action.eyebrow}
            </span>
            <span className="mt-1 block text-base font-maison-neue font-semibold">
              {action.title}
            </span>
          </span>
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
              isActive
                ? "border-white/15 bg-white/10 text-white"
                : "border-gray-200 bg-SilverPlate/30 text-Charcoal/55 group-hover:border-Gold/50 group-hover:text-Charcoal"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        </span>
        <span className="mt-3 block text-sm leading-5 opacity-72">
          {action.body}
        </span>
      </>
    )

    const className = `${workspaceItemClass} ${
      isActive
        ? "border-Charcoal bg-Charcoal text-white shadow-sm"
        : "border-gray-200 bg-white text-Charcoal hover:border-Gold/50 hover:bg-SilverPlate/25"
    }`

    return (
      <LocalizedClientLink
        aria-current={isActive ? "page" : undefined}
        className={className}
        href={action.href || `/account/staff/orders?workspace=${action.id}`}
        key={action.id}
        onClick={action.onClick}
      >
        {content}
      </LocalizedClientLink>
    )
  }

  function renderCustomerAccountActions({
    showEmptyState = false,
  }: {
    showEmptyState?: boolean
  } = {}) {
    const customerContext =
      selectedContext?.source === "customer" ? selectedContext : null

    if (!draftCustomer.id || !customerContext) {
      if (!showEmptyState) return null

      return (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-SilverPlate/35 text-Charcoal/55">
              <BadgeDollarSign className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="mt-4 text-xl font-gyst font-bold text-Charcoal">
              Select a storefront customer
            </h2>
            <p className="mt-2 max-w-md text-sm font-maison-neue text-Charcoal/60">
              Customer account actions unlock after staff select a Medusa
              customer record. Legacy QuickBooks-only results can be reviewed in
              Order Support, but credits and notes need a storefront customer.
            </p>
          </div>
        </section>
      )
    }

    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-3 small:flex-row small:items-start small:justify-between">
          <div>
            <p className="text-xs font-maison-neue-mono uppercase text-Gold">
              Customer account
            </p>
            <h2 className="text-xl font-gyst font-bold text-Charcoal">
              Account actions
            </h2>
            <p className="mt-1 max-w-xl text-sm font-maison-neue text-Charcoal/55">
              Record account-level notes or customer credits. Credits queue
              QuickBooks customer credit memo follow-up and do not refund a
              Stripe card.
            </p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-Gold/35 bg-Gold/10 px-3 py-1 text-xs font-maison-neue-mono uppercase text-Charcoal">
            {formatPrice(customerContext.accountCreditBalance, "usd")}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-3 text-xs font-rexton font-bold uppercase tracking-normal ${
              customerAccountAction === "customer_note"
                ? "border-Charcoal bg-Charcoal text-white"
                : "border-gray-200 bg-white text-Charcoal"
            }`}
            onClick={() => setCustomerAccountAction("customer_note")}
            type="button"
          >
            <NotebookPen size={16} aria-hidden="true" />
            Note
          </button>
          <button
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-3 text-xs font-rexton font-bold uppercase tracking-normal ${
              customerAccountAction === "customer_credit"
                ? "border-Charcoal bg-Charcoal text-white"
                : "border-gray-200 bg-white text-Charcoal"
            }`}
            onClick={() => setCustomerAccountAction("customer_credit")}
            type="button"
          >
            <BadgeDollarSign size={16} aria-hidden="true" />
            Credit
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {customerAccountAction === "customer_credit" && (
            <label className="flex flex-col gap-1">
              <span className={labelClass()}>Credit amount</span>
              <input
                className={fieldClass()}
                min="0"
                step="0.01"
                type="number"
                value={customerAccountAmount}
                onChange={(event) =>
                  setCustomerAccountAmount(event.target.value)
                }
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className={labelClass()}>Reason</span>
            <select
              className={fieldClass()}
              value={customerAccountReason}
              onChange={(event) =>
                setCustomerAccountReason(
                  event.target.value as StaffCustomerAccountReasonCode
                )
              }
            >
              {STAFF_CUSTOMER_ACCOUNT_REASON_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass()}>Related order</span>
            <select
              className={fieldClass()}
              value={customerAccountRelatedOrder}
              onChange={(event) =>
                setCustomerAccountRelatedOrder(event.target.value)
              }
            >
              <option value="">None</option>
              {customerAccountOrderOptions.map((order) => (
                <option value={order.value} key={order.value}>
                  {order.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass()}>Staff note</span>
            <textarea
              className={`${fieldClass()} min-h-[92px]`}
              value={customerAccountStaffNote}
              onChange={(event) =>
                setCustomerAccountStaffNote(event.target.value)
              }
            />
          </label>

          {customerAccountAction === "customer_credit" && (
            <label className="flex flex-col gap-1">
              <span className={labelClass()}>Customer note</span>
              <textarea
                className={`${fieldClass()} min-h-[72px]`}
                value={customerAccountVisibleNote}
                onChange={(event) =>
                  setCustomerAccountVisibleNote(event.target.value)
                }
              />
            </label>
          )}

          <Button
            className="min-h-[44px] w-full rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-Charcoal/40"
            disabled={customerAccountActionDisabled}
            isLoading={isPending}
            onClick={recordCustomerAccountAction}
            type="button"
          >
            {customerAccountAction === "customer_credit"
              ? "Issue Credit"
              : "Record Note"}
          </Button>
        </div>

        {customerContext.accountCredits.length ||
        customerContext.accountNotes.length ? (
          <div className="mt-5 space-y-4 border-t border-gray-100 pt-4">
            {customerContext.accountCredits.length ? (
              <div>
                <p className={labelClass()}>Credits</p>
                <div className="mt-2 space-y-2">
                  {[...customerContext.accountCredits]
                    .reverse()
                    .slice(0, 3)
                    .map((credit) => (
                      <div
                        className="rounded-md border border-Gold/25 bg-Gold/10 p-3"
                        key={credit.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                            {formatPrice(credit.amount, credit.currencyCode)}
                          </p>
                          <span className="rounded-full border border-Gold/35 bg-white px-2 py-0.5 text-[11px] font-maison-neue-mono uppercase text-Charcoal/70">
                            {credit.qbdPostingStatus || credit.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-maison-neue text-Charcoal/60">
                          {staffCustomerAccountReasonLabel(credit.reasonCode)} |{" "}
                          {formatDate(credit.createdAt)}
                        </p>
                        <p className="mt-2 text-sm font-maison-neue text-Charcoal/80">
                          {credit.staffNote}
                        </p>
                        {credit.relatedOrderDisplayId && (
                          <p className="mt-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                            {credit.relatedOrderDisplayId}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            {customerContext.accountNotes.length ? (
              <div>
                <p className={labelClass()}>Notes</p>
                <div className="mt-2 space-y-2">
                  {[...customerContext.accountNotes]
                    .reverse()
                    .slice(0, 3)
                    .map((note) => (
                      <div
                        className="rounded-md border border-gray-100 p-3"
                        key={note.id}
                      >
                        <p className="text-sm font-maison-neue text-Charcoal">
                          {note.note}
                        </p>
                        <p className="mt-2 text-xs font-maison-neue text-Charcoal/55">
                          {staffCustomerAccountReasonLabel(note.reasonCode)} |{" "}
                          {formatDate(note.createdAt)}
                        </p>
                        {note.relatedOrderDisplayId && (
                          <p className="mt-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                            {note.relatedOrderDisplayId}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-gray-100 bg-SilverPlate/30 px-3 py-3 text-sm font-maison-neue text-Charcoal/55">
            No account actions recorded.
          </p>
        )}
      </section>
    )
  }

  function renderCustomerAccountWorkspace() {
    return (
      <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs font-maison-neue-mono uppercase text-Gold">
            Customer account
          </p>
          <h2 className="mt-1 text-2xl font-gyst font-bold text-Charcoal">
            Find a customer
          </h2>
          <p className="mt-2 text-sm font-maison-neue text-Charcoal/60">
            Use this for customer-level notes and account credits. For a card
            refund, go to Order Support and select the specific order.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass()}>Customer search</span>
              <input
                className={fieldClass()}
                value={customerQuery}
                onChange={(event) => updateCustomerQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") runCustomerSearch()
                }}
                placeholder="Name, email, phone, or order number"
                type="search"
              />
            </label>
            <Button
              className="min-h-[44px] rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white"
              isLoading={isCustomerSearchPending}
              onClick={runCustomerSearch}
              type="button"
            >
              Search
            </Button>
          </div>

          {renderCustomerSearchFeedback()}

          {customerResults.length > 0 && (
            <div className="mt-5 divide-y rounded-md border border-gray-100">
              {customerResults.map((customer) => (
                <button
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-SilverPlate/40"
                  key={customer.id}
                  onClick={() =>
                    selectCustomer(customer, {
                      workspace: "customer_account",
                    })
                  }
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-maison-neue font-semibold text-Charcoal">
                      {[customer.firstName, customer.lastName]
                        .filter(Boolean)
                        .join(" ") || customer.email}
                    </span>
                    <span className="block break-words text-xs font-maison-neue text-Charcoal/55">
                      {[
                        customer.email,
                        customer.phone,
                        customer.matchedLegacyOrderDisplayId
                          ? `Legacy ${customer.matchedLegacyOrderDisplayId}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                    {sourceLabel(customer.source)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {draftCustomer.id && (
            <div className="mt-5 rounded-md border border-Gold/30 bg-Gold/10 p-4">
              <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/55">
                Selected customer
              </p>
              <h3 className="mt-2 text-lg font-gyst font-bold text-Charcoal">
                {[draftCustomer.firstName, draftCustomer.lastName]
                  .filter(Boolean)
                  .join(" ") || draftCustomer.email}
              </h3>
              <p className="mt-1 break-words text-sm font-maison-neue text-Charcoal/60">
                {draftCustomer.email}
              </p>
            </div>
          )}
        </section>

        {renderCustomerAccountActions({ showEmptyState: true })}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-5 large:flex-row large:items-start large:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                Staff console
              </p>
              {activeWorkspaceAction && (
                <span className="rounded-full border border-gray-200 bg-SilverPlate/40 px-2.5 py-1 text-[11px] font-maison-neue-mono uppercase text-Charcoal/55">
                  {activeWorkspaceAction.title}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-maison-neue font-semibold text-Charcoal">
              Help a customer
            </h1>
            <p className="mt-1 max-w-3xl text-sm font-maison-neue text-Charcoal/60">
              Search orders, finalize catch weights, enter customer context, and
              keep every staff action auditable from one workspace.
            </p>
          </div>
          <div className="flex flex-col gap-3 small:flex-row small:items-center large:justify-end">
            <LocalizedClientLink
              href="/account/staff/operations-guide"
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-Charcoal px-3.5 text-sm font-maison-neue font-semibold text-Charcoal transition hover:bg-Charcoal hover:text-white"
            >
              <BookOpenText className="h-4 w-4" aria-hidden />
              Guide
            </LocalizedClientLink>
            {canUseOffice && (
              <LocalizedClientLink
                href="/account/staff/communications"
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-Charcoal px-3.5 text-sm font-maison-neue font-semibold text-Charcoal transition hover:bg-Charcoal hover:text-white"
              >
                <MessageSquare className="h-4 w-4" aria-hidden />
                Communications
              </LocalizedClientLink>
            )}
            <div className="rounded-md border border-Gold/35 bg-Gold/10 px-3.5 py-2.5">
              <p className="text-[11px] font-maison-neue-mono uppercase text-Charcoal/55">
                Signed in
              </p>
              <p className="mt-0.5 text-sm font-maison-neue font-semibold text-Charcoal">
                {staffName}
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 bg-SilverPlate/35 p-3 md:grid-cols-2 xl:grid-cols-3">
          {workspaceActions.map(renderWorkspaceAction)}
        </div>
      </section>

      {impersonation && (
        <div className="rounded-md border border-Gold/40 bg-Gold/10 px-4 py-3">
          <div className="flex flex-col gap-3 small:flex-row small:items-center small:justify-between">
            <div>
              <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                Acting as {impersonation.targetName}
              </p>
              <p className="text-sm font-maison-neue text-Charcoal/60">
                Storefront, account, cart, and phone-order actions are audited
                to {impersonation.staffName}.
              </p>
            </div>
            <Button
              className="min-h-[40px] rounded-md border border-Charcoal px-4 text-sm font-rexton font-bold uppercase text-Charcoal"
              isLoading={isPending}
              onClick={endImpersonation}
              type="button"
            >
              Exit Context
            </Button>
          </div>
        </div>
      )}

      {(error || status) && (
        <div
          className={`rounded-md border px-4 py-3 text-sm font-maison-neue ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {error || status}
        </div>
      )}

      {activeWorkspace === "merchandising" && canReviewMerch ? (
        <StaffMerchandisingWorkspace
          countryCode={countryCode}
          initialError={initialMerchandisingError}
          initialTags={initialMerchandisingTags}
        />
      ) : activeWorkspace === "team_access" && canManageTeamAccess ? (
        <StaffTeamAccessConsole />
      ) : activeWorkspace === "quickbooks_sync" && canUseOrderSupport ? (
        <StaffQuickBooksSyncStatusConsole />
      ) : activeWorkspace === "finalization" ? (
        <StaffCatchWeightFinalizationConsole
          canChargeFinalOrders={canChargeFinalizedOrders}
          canPickOrders={canUsePickQueue}
          canPackOrders={canUsePackQueue}
          canViewAuditTrail={canManageTeamAccess}
        />
      ) : activeWorkspace === "customer_account" ? (
        renderCustomerAccountWorkspace()
      ) : isCustomerWorkspace ? (
        <>
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="grid gap-6 large:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                  {activeWorkspace === "new_customer"
                    ? "New customer"
                    : "Customer lookup"}
                </p>
                <h2 className="mt-1 text-2xl font-gyst font-bold text-Charcoal">
                  {activeWorkspace === "new_customer"
                    ? "Create a customer account"
                    : "Enter a customer account"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-maison-neue text-Charcoal/60">
                  {activeWorkspace === "new_customer"
                    ? "Use this when the caller is not already in the storefront. Search first if needed, then create the profile with contact and delivery details."
                    : "Search by name, email, phone, or legacy order. Pick the customer, then enter their account context. From there staff can use the same account, cart, address, reorder, and checkout surfaces the customer uses."}
                </p>

                <div className="mt-5 flex flex-col gap-3 small:flex-row small:items-end">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className={labelClass()}>Customer search</span>
                    <input
                      className={fieldClass()}
                      value={customerQuery}
                      onChange={(event) =>
                        updateCustomerQuery(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") runCustomerSearch()
                      }}
                      placeholder="Name, email, phone, or order number"
                      type="search"
                    />
                  </label>
                  <Button
                    className="min-h-[44px] rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white"
                    isLoading={isCustomerSearchPending}
                    onClick={runCustomerSearch}
                    type="button"
                  >
                    Search
                  </Button>
                </div>

                {renderCustomerSearchFeedback()}

                {showNewCustomerForm && !draftCustomer.id && (
                  <div className="mt-5 rounded-md border border-gray-200 bg-SilverPlate/25 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>Email</span>
                        <input
                          className={fieldClass()}
                          type="email"
                          value={draftCustomer.email}
                          onChange={(event) =>
                            updateDraftCustomer({ email: event.target.value })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>Phone</span>
                        <input
                          className={fieldClass()}
                          value={draftCustomer.phone}
                          onChange={(event) => {
                            updateDraftCustomer({ phone: event.target.value })
                            updateShippingAddress({ phone: event.target.value })
                          }}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>First name</span>
                        <input
                          className={fieldClass()}
                          value={draftCustomer.firstName}
                          onChange={(event) =>
                            updateDraftCustomer({
                              firstName: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>Last name</span>
                        <input
                          className={fieldClass()}
                          value={draftCustomer.lastName}
                          onChange={(event) =>
                            updateDraftCustomer({
                              lastName: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1 md:col-span-2">
                        <span className={labelClass()}>Company</span>
                        <input
                          className={fieldClass()}
                          value={draftCustomer.company}
                          onChange={(event) =>
                            updateDraftCustomer({
                              company: event.target.value,
                            })
                          }
                        />
                      </label>
                      {renderQuickBooksCustomerFields()}
                      <label className="flex flex-col gap-1 md:col-span-2">
                        <span className={labelClass()}>Address 1</span>
                        <input
                          className={fieldClass()}
                          value={shippingAddress.address1}
                          onChange={(event) =>
                            updateShippingAddress({
                              address1: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1 md:col-span-2">
                        <span className={labelClass()}>Address 2</span>
                        <input
                          className={fieldClass()}
                          value={shippingAddress.address2 || ""}
                          onChange={(event) =>
                            updateShippingAddress({
                              address2: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>City</span>
                        <input
                          className={fieldClass()}
                          value={shippingAddress.city}
                          onChange={(event) =>
                            updateShippingAddress({ city: event.target.value })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>State</span>
                        <input
                          className={fieldClass()}
                          value={shippingAddress.province}
                          onChange={(event) =>
                            updateShippingAddress({
                              province: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>ZIP</span>
                        <input
                          className={fieldClass()}
                          value={shippingAddress.postalCode}
                          onChange={(event) =>
                            updateShippingAddress({
                              postalCode: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="mt-4 flex items-start gap-3 rounded-md border border-Gold/35 bg-Gold/10 p-3 text-sm font-maison-neue text-Charcoal">
                      <input
                        checked={sendAccountInvite}
                        className="mt-1"
                        onChange={(event) =>
                          setSendAccountInvite(event.target.checked)
                        }
                        type="checkbox"
                      />
                      Send the customer an account-claim email so they can set
                      their own password later.
                    </label>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        className="min-h-[44px] rounded-md bg-Gold px-4 text-sm font-rexton font-bold uppercase text-Charcoal"
                        isLoading={isPending}
                        onClick={createCustomer}
                        type="button"
                      >
                        Create Customer
                      </Button>
                      <Button
                        className="min-h-[44px] rounded-md border border-gray-300 px-4 text-sm font-rexton font-bold uppercase text-Charcoal"
                        disabled={isPending}
                        onClick={cancelNewCustomer}
                        type="button"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {customerResults.length > 0 && (
                  <div className="mt-5 divide-y rounded-md border border-gray-100">
                    {customerResults.map((customer) => (
                      <button
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-SilverPlate/40"
                        key={customer.id}
                        onClick={() => selectCustomer(customer)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-maison-neue font-semibold text-Charcoal">
                            {[customer.firstName, customer.lastName]
                              .filter(Boolean)
                              .join(" ") || customer.email}
                          </span>
                          <span className="block break-words text-xs font-maison-neue text-Charcoal/55">
                            {[
                              customer.email,
                              customer.phone,
                              customer.matchedLegacyOrderDisplayId
                                ? `Legacy ${customer.matchedLegacyOrderDisplayId}`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" | ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                          {sourceLabel(customer.source)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <aside className="rounded-md border border-Gold/30 bg-Gold/10 p-4">
                <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/55">
                  Selected customer
                </p>
                {draftCustomer.id ? (
                  <>
                    <h3 className="mt-2 text-xl font-gyst font-bold text-Charcoal">
                      {[draftCustomer.firstName, draftCustomer.lastName]
                        .filter(Boolean)
                        .join(" ") || draftCustomer.email}
                    </h3>
                    <p className="mt-1 break-words text-sm font-maison-neue text-Charcoal/60">
                      {draftCustomer.email}
                    </p>
                    {selectedContext?.accountClaimStatus && (
                      <p className="mt-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                        Account claim:{" "}
                        {selectedContext.accountClaimStatus.replace(/_/g, " ")}
                      </p>
                    )}
                    <Button
                      className="mt-4 min-h-[44px] w-full rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white"
                      isLoading={isPending}
                      onClick={beginImpersonation}
                      type="button"
                    >
                      {impersonation?.targetCustomerId === draftCustomer.id
                        ? "Context Active"
                        : "Enter Account Context"}
                    </Button>
                  </>
                ) : (
                  <p className="mt-2 text-sm font-maison-neue text-Charcoal/60">
                    Search and select a storefront customer, or create a new
                    caller profile with contact and address details. Legacy
                    records without a linked storefront account can be reviewed
                    in Order Support, but cannot be impersonated.
                  </p>
                )}
              </aside>
            </div>
          </section>

          <div
            className={draftCustomer.id ? "block" : "hidden"}
            aria-hidden={!draftCustomer.id}
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-6">
                <section className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="mb-4">
                    <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                      Customer profile
                    </p>
                    <h2 className="text-xl font-gyst font-bold text-Charcoal">
                      Find or create the customer
                    </h2>
                    <p className="mt-1 text-sm font-maison-neue text-Charcoal/55">
                      Search fills the editable profile fields below. Save
                      Customer persists profile changes with a staff audit
                      entry.
                    </p>
                  </div>
                  <div className="mb-4 flex flex-col gap-3 small:flex-row small:items-end">
                    <label className="flex flex-1 flex-col gap-1">
                      <span className={labelClass()}>Customer search</span>
                      <input
                        className={fieldClass()}
                        value={customerQuery}
                        onChange={(event) =>
                          updateCustomerQuery(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") runCustomerSearch()
                        }}
                        type="search"
                      />
                    </label>
                    <Button
                      className="min-h-[44px] rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white"
                      isLoading={isCustomerSearchPending}
                      onClick={runCustomerSearch}
                      type="button"
                    >
                      Search
                    </Button>
                  </div>

                  {renderCustomerSearchFeedback("mt-4 mb-5")}

                  {customerResults.length > 0 && (
                    <div className="mb-5 divide-y rounded-md border border-gray-100">
                      {customerResults.map((customer) => (
                        <button
                          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-SilverPlate/40"
                          key={customer.id}
                          onClick={() => selectCustomer(customer)}
                          type="button"
                        >
                          <span>
                            <span className="block text-sm font-maison-neue font-semibold text-Charcoal">
                              {[customer.firstName, customer.lastName]
                                .filter(Boolean)
                                .join(" ") || customer.email}
                            </span>
                            <span className="block text-xs font-maison-neue text-Charcoal/55">
                              {[
                                customer.email,
                                customer.matchedLegacyOrderDisplayId
                                  ? `Legacy ${customer.matchedLegacyOrderDisplayId}`
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" | ")}
                            </span>
                          </span>
                          <span className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                            {sourceLabel(customer.source)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>Email</span>
                      <input
                        className={fieldClass()}
                        type="email"
                        value={draftCustomer.email}
                        onChange={(event) =>
                          updateDraftCustomer({ email: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>Phone</span>
                      <input
                        className={fieldClass()}
                        value={draftCustomer.phone}
                        onChange={(event) =>
                          updateDraftCustomer({ phone: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>First name</span>
                      <input
                        className={fieldClass()}
                        value={draftCustomer.firstName}
                        onChange={(event) =>
                          updateDraftCustomer({ firstName: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>Last name</span>
                      <input
                        className={fieldClass()}
                        value={draftCustomer.lastName}
                        onChange={(event) =>
                          updateDraftCustomer({ lastName: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className={labelClass()}>Company</span>
                      <input
                        className={fieldClass()}
                        value={draftCustomer.company}
                        onChange={(event) =>
                          updateDraftCustomer({ company: event.target.value })
                        }
                      />
                    </label>
                    {renderQuickBooksCustomerFields()}
                  </div>

                  {!draftCustomer.id && (
                    <Button
                      className="mt-4 min-h-[44px] rounded-md border border-Charcoal px-4 text-sm font-rexton font-bold uppercase text-Charcoal"
                      isLoading={isPending}
                      onClick={createCustomer}
                      type="button"
                    >
                      Create Customer
                    </Button>
                  )}

                  {draftCustomer.id && (
                    <div className="mt-4 grid gap-3 small:grid-cols-2">
                      <Button
                        className="min-h-[44px] rounded-md border border-Charcoal px-4 text-sm font-rexton font-bold uppercase text-Charcoal"
                        isLoading={isPending}
                        onClick={saveCustomerProfile}
                        type="button"
                      >
                        Save Customer
                      </Button>
                      <Button
                        className="min-h-[44px] rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white"
                        isLoading={isPending}
                        onClick={beginImpersonation}
                        type="button"
                      >
                        {impersonation?.targetCustomerId === draftCustomer.id
                          ? "Context Active"
                          : "Enter Account Context"}
                      </Button>
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="mb-4">
                    <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                      Shipping address
                    </p>
                    <h2 className="text-xl font-gyst font-bold text-Charcoal">
                      Address for this order
                    </h2>
                    <p className="mt-1 text-sm font-maison-neue text-Charcoal/55">
                      Select or create the customer first. Their saved address
                      loads here when available. Edits apply to this order only
                      unless you explicitly save them back to the customer
                      account.
                    </p>
                  </div>
                  {!canEditShippingAddress && (
                    <div className="mb-4 rounded-md border border-Gold/30 bg-Gold/10 px-4 py-3">
                      <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                        Address unlocks after customer selection.
                      </p>
                      <p className="mt-1 text-sm font-maison-neue text-Charcoal/60">
                        Search or create a customer above, then confirm the
                        shipping address for this specific phone order.
                      </p>
                    </div>
                  )}
                  <fieldset
                    className="grid gap-3 md:grid-cols-2"
                    disabled={!canEditShippingAddress}
                  >
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>First name</span>
                      <input
                        className={fieldClass()}
                        value={shippingAddress.firstName}
                        onChange={(event) =>
                          updateShippingAddress({
                            firstName: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>Last name</span>
                      <input
                        className={fieldClass()}
                        value={shippingAddress.lastName}
                        onChange={(event) =>
                          updateShippingAddress({
                            lastName: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className={labelClass()}>Address 1</span>
                      <input
                        className={fieldClass()}
                        value={shippingAddress.address1}
                        onChange={(event) =>
                          updateShippingAddress({
                            address1: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 md:col-span-2">
                      <span className={labelClass()}>Address 2</span>
                      <input
                        className={fieldClass()}
                        value={shippingAddress.address2 || ""}
                        onChange={(event) =>
                          updateShippingAddress({
                            address2: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>City</span>
                      <input
                        className={fieldClass()}
                        value={shippingAddress.city}
                        onChange={(event) =>
                          updateShippingAddress({ city: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>State</span>
                      <input
                        className={fieldClass()}
                        value={shippingAddress.province}
                        onChange={(event) =>
                          updateShippingAddress({
                            province: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>ZIP</span>
                      <input
                        className={fieldClass()}
                        value={shippingAddress.postalCode}
                        onChange={(event) =>
                          updateShippingAddress({
                            postalCode: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>Phone</span>
                      <input
                        className={fieldClass()}
                        value={shippingAddress.phone || ""}
                        onChange={(event) =>
                          updateShippingAddress({ phone: event.target.value })
                        }
                      />
                    </label>
                  </fieldset>
                  {draftCustomer.id && (
                    <Button
                      className="mt-4 min-h-[44px] rounded-md border border-Charcoal px-4 text-sm font-rexton font-bold uppercase text-Charcoal"
                      isLoading={isPending}
                      onClick={saveCustomerAddress}
                      type="button"
                    >
                      Save Address to Customer
                    </Button>
                  )}
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="mb-4">
                    <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                      Order items
                    </p>
                    <h2 className="text-xl font-gyst font-bold text-Charcoal">
                      Add products
                    </h2>
                    <p className="mt-1 text-sm font-maison-neue text-Charcoal/55">
                      Product results add line items to this staff-prepared
                      cart. Quantities are edited in the order panel.
                    </p>
                  </div>
                  <div className="mb-4 flex flex-col gap-3 small:flex-row small:items-end">
                    <label className="flex flex-1 flex-col gap-1">
                      <span className={labelClass()}>Product search</span>
                      <input
                        className={fieldClass()}
                        value={productQuery}
                        onChange={(event) =>
                          setProductQuery(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") runProductSearch()
                        }}
                        type="search"
                      />
                    </label>
                    <Button
                      className="min-h-[44px] rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white"
                      isLoading={isPending}
                      onClick={runProductSearch}
                      type="button"
                    >
                      Search
                    </Button>
                  </div>

                  {productResults.length > 0 && (
                    <div className="divide-y rounded-md border border-gray-100">
                      {productResults.map((product) => (
                        <button
                          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-SilverPlate/40"
                          key={product.variantId}
                          onClick={() => addProduct(product)}
                          type="button"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-maison-neue font-semibold text-Charcoal">
                              {product.title}
                            </span>
                            <span className="block text-xs font-maison-neue text-Charcoal/55">
                              {[product.variantTitle, product.sku]
                                .filter(Boolean)
                                .join(" | ")}
                            </span>
                            {product.availability &&
                              product.availability.decision !== "available" && (
                                <span className="mt-1 block text-xs font-maison-neue text-Charcoal/60">
                                  {product.availability.decision ===
                                  "future_allowed"
                                    ? "Accepted for the selected future date."
                                    : product.availability
                                        .earliest_available_date
                                    ? `Expected around ${product.availability.earliest_available_date}.`
                                    : "Needs staff resolution for this date."}
                                </span>
                              )}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-2">
                            <span className="text-sm font-maison-neue text-Charcoal">
                              {formatPrice(
                                product.calculatedAmount,
                                product.currencyCode
                              )}
                            </span>
                            {(() => {
                              const badge = availabilityBadge(
                                product.availability
                              )
                              return (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-maison-neue-mono uppercase ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              )
                            })()}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-6">
                <section className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="mb-4">
                    <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                      Staff-prepared cart
                    </p>
                    <h2 className="text-xl font-gyst font-bold text-Charcoal">
                      Order controls
                    </h2>
                    <p className="mt-1 text-sm font-maison-neue text-Charcoal/55">
                      These fields apply to this order only. They unlock after a
                      customer and at least one product are selected, then
                      preparing payment creates the staff cart.
                    </p>
                  </div>
                  {!canEditOrderControls && (
                    <div className="mb-4 rounded-md border border-Gold/30 bg-Gold/10 px-4 py-3">
                      <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                        Build the draft before choosing fulfillment.
                      </p>
                      <div className="mt-3 space-y-2 text-sm font-maison-neue text-Charcoal/70">
                        <div className="flex items-center justify-between gap-3">
                          <span>Customer selected</span>
                          <span className="font-semibold text-Charcoal">
                            {hasSelectedCustomer ? "Done" : "Needed"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Products added</span>
                          <span className="font-semibold text-Charcoal">
                            {hasOrderLines ? "Done" : "Needed"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Order verified</span>
                          <span className="font-semibold text-Charcoal">
                            {customerVerified ? "Done" : "After items"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  {lines.length ? (
                    <div className="divide-y border-y border-gray-100">
                      {lines.map((line) => (
                        <div className="py-3" key={line.variantId}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                                {line.title}
                              </p>
                              {line.sku && (
                                <p className="text-xs font-maison-neue text-Charcoal/50">
                                  {line.sku}
                                </p>
                              )}
                              {line.availability && (
                                <p
                                  className={`mt-1 text-xs font-maison-neue ${
                                    staffLineNeedsOverride(line)
                                      ? "text-amber-700"
                                      : line.availability.decision ===
                                        "inactive"
                                      ? "text-red-700"
                                      : "text-Charcoal/55"
                                  }`}
                                >
                                  {line.availability.decision ===
                                  "future_allowed"
                                    ? "Future commitment accepted for the selected date."
                                    : line.availability.decision === "available"
                                    ? `${line.availability.available_to_promise_quantity} available to promise.`
                                    : line.availability.decision === "partial"
                                    ? `${line.availability.available_to_promise_quantity} available; staff override or quantity change required.`
                                    : line.availability.decision === "inactive"
                                    ? "Inactive item. Choose a different item."
                                    : "Blocked for this date. Choose replacement/date or record override."}
                                </p>
                              )}
                            </div>
                            <input
                              aria-label={`Quantity for ${line.title}`}
                              className="h-10 w-20 rounded-md border border-gray-200 px-2 text-center text-sm"
                              min={0}
                              type="number"
                              value={line.quantity}
                              onChange={(event) =>
                                updateLineQuantity(
                                  line.variantId,
                                  Number(event.target.value)
                                )
                              }
                            />
                          </div>
                          {staffLineNeedsOverride(line) && (
                            <div className="mt-3 grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                              <label className="flex flex-col gap-1">
                                <span className={labelClass()}>
                                  Override reason
                                </span>
                                <select
                                  className={fieldClass()}
                                  value={line.overrideReason || ""}
                                  onChange={(event) =>
                                    updateLinePatch(line.variantId, {
                                      overrideReason: event.target.value,
                                    })
                                  }
                                >
                                  <option value="">Select reason</option>
                                  <option value="holiday_preorder">
                                    Holiday preorder
                                  </option>
                                  <option value="peter_approved">
                                    Peter approved
                                  </option>
                                  <option value="known_replenishment">
                                    Known replenishment
                                  </option>
                                  <option value="customer_accepts_delay">
                                    Customer accepts delay
                                  </option>
                                  <option value="substitution_confirmed">
                                    Substitution confirmed
                                  </option>
                                  <option value="other">Other</option>
                                </select>
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className={labelClass()}>
                                  Override note
                                </span>
                                <textarea
                                  className={`${fieldClass()} min-h-[72px]`}
                                  value={line.overrideNote || ""}
                                  onChange={(event) =>
                                    updateLinePatch(line.variantId, {
                                      overrideNote: event.target.value,
                                    })
                                  }
                                  placeholder="Record what the customer accepted or who approved it."
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-maison-neue text-Charcoal/55">
                      No products added yet.
                    </p>
                  )}

                  {canEditOrderControls ? (
                    <>
                      <fieldset className="mt-4 space-y-3">
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Fulfillment</span>
                          <select
                            className={fieldClass()}
                            value={fulfillmentType}
                            onChange={(event) =>
                              setFulfillmentType(
                                event.target.value as typeof fulfillmentType
                              )
                            }
                          >
                            <option value="plant_pickup">Plant pickup</option>
                            <option value="atlanta_delivery">
                              Atlanta delivery
                            </option>
                            <option value="southeast_pickup">
                              Southeast pickup
                            </option>
                            <option value="ups_shipping">UPS shipping</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Scheduled date</span>
                          <input
                            className={fieldClass()}
                            type="date"
                            value={scheduledDate}
                            onChange={(event) =>
                              setScheduledDate(event.target.value)
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Time window</span>
                          <input
                            className={fieldClass()}
                            value={scheduledTimeWindow}
                            onChange={(event) =>
                              setScheduledTimeWindow(event.target.value)
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Substitutions</span>
                          <input
                            className={fieldClass()}
                            value={substitutionPreference}
                            onChange={(event) =>
                              setSubstitutionPreference(event.target.value)
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Delivery notes</span>
                          <textarea
                            className={`${fieldClass()} min-h-[90px]`}
                            value={deliveryInstructions}
                            onChange={(event) =>
                              setDeliveryInstructions(event.target.value)
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Order notes</span>
                          <textarea
                            className={`${fieldClass()} min-h-[90px]`}
                            value={orderNotes}
                            onChange={(event) =>
                              setOrderNotes(event.target.value)
                            }
                          />
                        </label>
                        <label className="flex items-start gap-3 text-sm font-maison-neue text-Charcoal">
                          <input
                            checked={sameAsShipping}
                            className="mt-1"
                            onChange={(event) =>
                              setSameAsShipping(event.target.checked)
                            }
                            type="checkbox"
                          />
                          Billing address matches shipping
                        </label>
                        <label className="flex items-start gap-3 text-sm font-maison-neue text-Charcoal">
                          <input
                            checked={customerVerified}
                            className="mt-1"
                            onChange={(event) =>
                              setCustomerVerified(event.target.checked)
                            }
                            type="checkbox"
                          />
                          Customer identity and order details verified
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Payment handling</span>
                          <select
                            className={fieldClass()}
                            value={paymentMode}
                            onChange={(event) =>
                              setPaymentMode(
                                event.target.value as StaffPaymentMode
                              )
                            }
                          >
                            <option value="collect_card_now">
                              Collect card by phone
                            </option>
                            <option value="send_checkout_link">
                              Send customer checkout link
                            </option>
                          </select>
                        </label>
                        {paymentMode === "collect_card_now" && (
                          <label className="flex items-start gap-3 rounded-md border border-Gold/35 bg-Gold/10 p-3 text-sm font-maison-neue text-Charcoal">
                            <input
                              checked={paymentConsent}
                              className="mt-1"
                              onChange={(event) =>
                                setPaymentConsent(event.target.checked)
                              }
                              type="checkbox"
                            />
                            Customer explicitly authorized this staff member to
                            enter and process card details for this order.
                          </label>
                        )}
                        <label className="flex items-start gap-3 text-sm font-maison-neue text-Charcoal">
                          <input
                            checked={sendConfirmation}
                            className="mt-1"
                            onChange={(event) =>
                              setSendConfirmation(event.target.checked)
                            }
                            type="checkbox"
                          />
                          Email checkout link to customer
                        </label>
                      </fieldset>

                      {hasUnresolvedStaffBlocks && (
                        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-maison-neue text-amber-800">
                          Resolve blocked inventory lines with a reason and note
                          before preparing payment.
                        </div>
                      )}

                      <Button
                        className="mt-5 min-h-[48px] w-full rounded-md bg-Gold px-4 text-sm font-rexton font-bold uppercase text-Charcoal disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-Charcoal/40"
                        disabled={prepareDisabled}
                        isLoading={isPending}
                        onClick={prepareOrder}
                        type="button"
                      >
                        {paymentMode === "collect_card_now"
                          ? "Prepare Payment"
                          : "Prepare Checkout Link"}
                      </Button>
                    </>
                  ) : (
                    <p className="mt-4 rounded-md border border-gray-100 bg-SilverPlate/30 px-3 py-3 text-sm font-maison-neue text-Charcoal/60">
                      Fulfillment, verification, and payment controls appear
                      after the staff draft has a customer and at least one
                      product.
                    </p>
                  )}

                  {checkoutUrl && (
                    <a
                      className="mt-4 block break-words rounded-md border border-Gold/40 bg-Gold/10 px-3 py-3 text-sm font-maison-neue text-Charcoal underline"
                      href={checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {checkoutUrl}
                    </a>
                  )}

                  {prepareResult?.ok &&
                    prepareResult.paymentClientSecret &&
                    paymentMode === "collect_card_now" &&
                    (stripePromise ? (
                      <Elements
                        stripe={stripePromise}
                        options={{
                          clientSecret: prepareResult.paymentClientSecret,
                        }}
                      >
                        <StaffChargeCard
                          result={prepareResult}
                          billingAddress={shippingAddress}
                          onComplete={(result) => {
                            setCompleteResult(result)
                            setStatus(
                              result.ok
                                ? `Order ${
                                    result.displayId || result.orderId
                                  } placed.`
                                : null
                            )
                            if (!result.ok)
                              setError(
                                result.error || "Could not complete order."
                              )
                          }}
                        />
                      </Elements>
                    ) : (
                      <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm font-maison-neue text-red-700">
                        Stripe publishable key is not configured for this
                        deploy.
                      </div>
                    ))}

                  {completeResult?.ok && (
                    <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm font-maison-neue text-green-700">
                      Order {completeResult.displayId || completeResult.orderId}{" "}
                      placed and marked as staff-entered.
                    </div>
                  )}
                </section>

                {draftCustomer.id && selectedContext?.source === "customer" ? (
                  <section className="rounded-lg border border-gray-200 bg-white p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                          Customer account
                        </p>
                        <h2 className="text-xl font-gyst font-bold text-Charcoal">
                          Account actions
                        </h2>
                      </div>
                      <span className="rounded-full border border-Gold/35 bg-Gold/10 px-3 py-1 text-xs font-maison-neue-mono uppercase text-Charcoal">
                        {formatPrice(
                          selectedContext.accountCreditBalance,
                          "usd"
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={`flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-3 text-xs font-rexton font-bold uppercase tracking-normal ${
                          customerAccountAction === "customer_note"
                            ? "border-Charcoal bg-Charcoal text-white"
                            : "border-gray-200 bg-white text-Charcoal"
                        }`}
                        onClick={() =>
                          setCustomerAccountAction("customer_note")
                        }
                        type="button"
                      >
                        <NotebookPen size={16} aria-hidden="true" />
                        Note
                      </button>
                      <button
                        className={`flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-3 text-xs font-rexton font-bold uppercase tracking-normal ${
                          customerAccountAction === "customer_credit"
                            ? "border-Charcoal bg-Charcoal text-white"
                            : "border-gray-200 bg-white text-Charcoal"
                        }`}
                        onClick={() =>
                          setCustomerAccountAction("customer_credit")
                        }
                        type="button"
                      >
                        <BadgeDollarSign size={16} aria-hidden="true" />
                        Credit
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {customerAccountAction === "customer_credit" && (
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Credit amount</span>
                          <input
                            className={fieldClass()}
                            min="0"
                            step="0.01"
                            type="number"
                            value={customerAccountAmount}
                            onChange={(event) =>
                              setCustomerAccountAmount(event.target.value)
                            }
                          />
                        </label>
                      )}

                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>Reason</span>
                        <select
                          className={fieldClass()}
                          value={customerAccountReason}
                          onChange={(event) =>
                            setCustomerAccountReason(
                              event.target
                                .value as StaffCustomerAccountReasonCode
                            )
                          }
                        >
                          {STAFF_CUSTOMER_ACCOUNT_REASON_OPTIONS.map(
                            (option) => (
                              <option value={option.value} key={option.value}>
                                {option.label}
                              </option>
                            )
                          )}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>Related order</span>
                        <select
                          className={fieldClass()}
                          value={customerAccountRelatedOrder}
                          onChange={(event) =>
                            setCustomerAccountRelatedOrder(event.target.value)
                          }
                        >
                          <option value="">None</option>
                          {customerAccountOrderOptions.map((order) => (
                            <option value={order.value} key={order.value}>
                              {order.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>Staff note</span>
                        <textarea
                          className={`${fieldClass()} min-h-[92px]`}
                          value={customerAccountStaffNote}
                          onChange={(event) =>
                            setCustomerAccountStaffNote(event.target.value)
                          }
                        />
                      </label>

                      {customerAccountAction === "customer_credit" && (
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Customer note</span>
                          <textarea
                            className={`${fieldClass()} min-h-[72px]`}
                            value={customerAccountVisibleNote}
                            onChange={(event) =>
                              setCustomerAccountVisibleNote(event.target.value)
                            }
                          />
                        </label>
                      )}

                      <Button
                        className="min-h-[44px] w-full rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-Charcoal/40"
                        disabled={customerAccountActionDisabled}
                        isLoading={isPending}
                        onClick={recordCustomerAccountAction}
                        type="button"
                      >
                        {customerAccountAction === "customer_credit"
                          ? "Issue Credit"
                          : "Record Note"}
                      </Button>
                    </div>

                    {selectedContext.accountCredits.length ||
                    selectedContext.accountNotes.length ? (
                      <div className="mt-5 space-y-4 border-t border-gray-100 pt-4">
                        {selectedContext.accountCredits.length ? (
                          <div>
                            <p className={labelClass()}>Credits</p>
                            <div className="mt-2 space-y-2">
                              {[...selectedContext.accountCredits]
                                .reverse()
                                .slice(0, 3)
                                .map((credit) => (
                                  <div
                                    className="rounded-md border border-Gold/25 bg-Gold/10 p-3"
                                    key={credit.id}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                                        {formatPrice(
                                          credit.amount,
                                          credit.currencyCode
                                        )}
                                      </p>
                                      <span className="rounded-full border border-Gold/35 bg-white px-2 py-0.5 text-[11px] font-maison-neue-mono uppercase text-Charcoal/70">
                                        {credit.qbdPostingStatus ||
                                          credit.status}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs font-maison-neue text-Charcoal/60">
                                      {staffCustomerAccountReasonLabel(
                                        credit.reasonCode
                                      )}{" "}
                                      | {formatDate(credit.createdAt)}
                                    </p>
                                    <p className="mt-2 text-sm font-maison-neue text-Charcoal/80">
                                      {credit.staffNote}
                                    </p>
                                    {credit.relatedOrderDisplayId && (
                                      <p className="mt-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                                        {credit.relatedOrderDisplayId}
                                      </p>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : null}

                        {selectedContext.accountNotes.length ? (
                          <div>
                            <p className={labelClass()}>Notes</p>
                            <div className="mt-2 space-y-2">
                              {[...selectedContext.accountNotes]
                                .reverse()
                                .slice(0, 3)
                                .map((note) => (
                                  <div
                                    className="rounded-md border border-gray-100 p-3"
                                    key={note.id}
                                  >
                                    <p className="text-sm font-maison-neue text-Charcoal">
                                      {note.note}
                                    </p>
                                    <p className="mt-2 text-xs font-maison-neue text-Charcoal/55">
                                      {staffCustomerAccountReasonLabel(
                                        note.reasonCode
                                      )}{" "}
                                      | {formatDate(note.createdAt)}
                                    </p>
                                    {note.relatedOrderDisplayId && (
                                      <p className="mt-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                                        {note.relatedOrderDisplayId}
                                      </p>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-4 rounded-md border border-gray-100 bg-SilverPlate/30 px-3 py-3 text-sm font-maison-neue text-Charcoal/55">
                        No account actions recorded.
                      </p>
                    )}
                  </section>
                ) : null}

                {selectedContext?.recentOrders?.length ? (
                  <section className="rounded-lg border border-gray-200 bg-white p-5">
                    <h2 className="mb-4 text-xl font-gyst font-bold text-Charcoal">
                      Recent orders
                    </h2>
                    <div className="space-y-3">
                      {selectedContext.recentOrders.map((order) => (
                        <div
                          className="rounded-md border border-gray-100 p-3"
                          key={order.id}
                        >
                          <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                            {order.displayId}
                          </p>
                          <p className="text-xs font-maison-neue text-Charcoal/55">
                            {new Date(order.createdAt).toLocaleDateString()} |{" "}
                            {order.status}
                          </p>
                          <ul className="mt-2 space-y-1 text-xs font-maison-neue text-Charcoal/70">
                            {order.items.slice(0, 4).map((item, index) => (
                              <li key={`${order.id}-${index}`}>
                                {item.quantity} x {item.title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {selectedContext?.legacyOrders?.length ? (
                  <section className="rounded-lg border border-gray-200 bg-white p-5">
                    <h2 className="mb-4 text-xl font-gyst font-bold text-Charcoal">
                      QuickBooks history
                    </h2>
                    <div className="space-y-3">
                      {selectedContext.legacyOrders.map((order) => (
                        <div
                          className="rounded-md border border-gray-100 p-3"
                          key={order.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-maison-neue font-semibold text-Charcoal">
                                {order.displayId}
                              </p>
                              <p className="text-xs font-maison-neue text-Charcoal/55">
                                {formatDate(order.placedAt)} | {order.status}
                              </p>
                            </div>
                            <p className="shrink-0 text-right text-xs font-maison-neue font-semibold text-Charcoal">
                              {formatPrice(order.total, order.currencyCode)}
                            </p>
                          </div>

                          <ul className="mt-2 space-y-2 text-xs font-maison-neue text-Charcoal/70">
                            {order.items.slice(0, 6).map((item) => (
                              <li
                                className="border-t border-gray-100 pt-2"
                                key={item.id}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="min-w-0 break-words">
                                    {item.quantity} x {item.title}
                                  </span>
                                  <span className="shrink-0 text-Charcoal/55">
                                    {formatPrice(
                                      item.lineTotal,
                                      order.currencyCode
                                    )}
                                  </span>
                                </div>
                                {(item.sku || item.lineKind !== "product") && (
                                  <p className="mt-1 text-[11px] uppercase tracking-normal text-Charcoal/45">
                                    {[
                                      item.sku,
                                      item.lineKind !== "product"
                                        ? item.lineKind
                                        : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" | ")}
                                  </p>
                                )}
                                {item.description && (
                                  <p className="mt-1 line-clamp-2 text-Charcoal/50">
                                    {item.description}
                                  </p>
                                )}
                                {item.variantId ? (
                                  <button
                                    className="mt-2 inline-flex min-h-[32px] items-center justify-center rounded-md bg-Gold px-3 text-[11px] font-rexton font-bold uppercase text-Charcoal transition-opacity hover:opacity-95"
                                    onClick={() => addLegacyItem(item)}
                                    type="button"
                                  >
                                    Add to Order
                                  </button>
                                ) : item.lineKind === "product" ? (
                                  <p className="mt-2 text-[11px] font-maison-neue-mono uppercase text-Charcoal/45">
                                    Needs catalog match
                                  </p>
                                ) : null}
                              </li>
                            ))}
                          </ul>

                          {order.lineCount > order.items.slice(0, 6).length && (
                            <p className="mt-2 text-xs font-maison-neue text-Charcoal/45">
                              +
                              {order.lineCount - order.items.slice(0, 6).length}{" "}
                              more lines
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </aside>
            </div>
          </div>
        </>
      ) : (
        <StaffOrderExceptionConsole staffRole={staffRole} />
      )}
    </div>
  )
}
