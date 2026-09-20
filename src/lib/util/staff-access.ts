import type { HttpTypes } from "@medusajs/types"

type StaffMetadata = Record<string, unknown> | null | undefined
type ServerStaffAccess = { role?: unknown; final_charge_enabled?: boolean; bootstrap?: boolean; session_current?: boolean }
type StaffCustomerLike =
  | (Pick<HttpTypes.StoreCustomer, "metadata"> & { email?: string | null; staff_access?: ServerStaffAccess })
  | null
  | undefined

export type StaffAccessRole =
  | "customer"
  | "staff"
  | "office"
  | "picker"
  | "packer"
  | "manager"
  | "merchandising_reviewer"
  | "super_admin"

export const STAFF_ROLE_OPTIONS: Array<{
  value: StaffAccessRole
  label: string
  description: string
  confirmation: string
}> = [
  {
    value: "customer",
    label: "Customer",
    description: "No staff console access.",
    confirmation: "REMOVE STAFF",
  },
  {
    value: "staff",
    label: "General staff",
    description:
      "Legacy broad access across customer context, order support, and back office work.",
    confirmation: "STAFF",
  },
  {
    value: "office",
    label: "Office",
    description:
      "Customer context, account creation, phone orders, order support, and communications.",
    confirmation: "OFFICE",
  },
  {
    value: "picker",
    label: "Picker",
    description:
      "Can pick order lines, record shortages/substitutions, and hand orders to packing.",
    confirmation: "PICKER",
  },
  {
    value: "packer",
    label: "Packer",
    description:
      "Can confirm packed counts, enter per-item weights, record package details, and mark packed orders ready.",
    confirmation: "PACKER",
  },
  {
    value: "manager",
    label: "Manager",
    description:
      "Office plus pick/pack access, exception review, and optional final charge permission.",
    confirmation: "MANAGER",
  },
  {
    value: "merchandising_reviewer",
    label: "Merchandising reviewer",
    description:
      "Product merchandising only: review L3 product photo groups and approve/reject images. No order, customer, or pick/pack access.",
    confirmation: "MERCHANDISING",
  },
  {
    value: "super_admin",
    label: "Super admin",
    description: "All staff powers plus team access management.",
    confirmation: "SUPER ADMIN",
  },
]

const TRUE_VALUES = new Set([
  "1",
  "true",
  "yes",
  "y",
  "staff",
  "admin",
  "ops",
  "operator",
  "customer_service",
])

const FALSE_VALUES = new Set(["0", "false", "no", "n", "customer", "none"])

const STAFF_ROLES = new Set([
  "staff",
  "office",
  "picker",
  "packer",
  "manager",
  "admin",
  "ops",
  "operator",
  "customer_service",
  "customer-service",
  "phone_orders",
  "phone-orders",
  "super_admin",
  "super-admin",
  "owner",
])

function truthyStaffValue(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === "number") return value === 1
  if (typeof value !== "string") return false
  return TRUE_VALUES.has(value.trim().toLowerCase())
}

function falseyStaffValue(value: unknown): boolean {
  if (value === false) return true
  if (typeof value === "number") return value === 0
  if (typeof value !== "string") return false
  return FALSE_VALUES.has(value.trim().toLowerCase())
}

export function isBootstrapStaffCustomer(customer: StaffCustomerLike): boolean {
  return customer?.staff_access?.bootstrap === true
}

function normalizeRole(value: unknown): string {
  return String(value || "").trim().toLowerCase()
}

export function staffMetadataRole(metadata: StaffMetadata): StaffAccessRole {
  if (!metadata) return "customer"

  if (truthyStaffValue(metadata.staff_access_revoked)) {
    return "customer"
  }

  const role = normalizeRole(
    metadata.gp_staff_role ||
      metadata.staff_role ||
      metadata.role ||
      metadata.account_role ||
      ""
  )

  if (role === "super_admin" || role === "super-admin" || role === "owner") {
    return "super_admin"
  }

  if (
    role === "merchandising_reviewer" ||
    role === "merchandising-reviewer" ||
    role === "merchandising"
  ) {
    return "merchandising_reviewer"
  }

  if (
    role === "office" ||
    role === "picker" ||
    role === "packer" ||
    role === "manager"
  ) {
    return role
  }

  if (STAFF_ROLES.has(role)) {
    return "staff"
  }

  // An explicit customer/unknown role cannot be promoted by stale broad flags.
  if (role) return "customer"

  const directFlags = [
    metadata.is_staff,
    metadata.staff,
    metadata.gp_staff,
    metadata.staff_access,
    metadata.phone_order_staff,
  ]

  if (directFlags.some(truthyStaffValue)) return "staff"

  return "customer"
}

export function isStaffMetadata(metadata: StaffMetadata): boolean {
  return staffMetadataRole(metadata) !== "customer"
}

export function isStaffCustomer(
  customer: StaffCustomerLike
): boolean {
  return staffAccessRole(customer) !== "customer"
}

export function staffAccessRole(customer: StaffCustomerLike): StaffAccessRole {
  if (customer?.staff_access) {
    if (customer.staff_access.session_current === false) return "customer"
    const role = customer.staff_access.role
    return STAFF_ROLE_OPTIONS.some(option => option.value === role) ? role as StaffAccessRole : "customer"
  }
  return staffMetadataRole(customer?.metadata as StaffMetadata)
}

export function isSuperAdminCustomer(customer: StaffCustomerLike): boolean {
  return staffAccessRole(customer) === "super_admin"
}

export function canChargeFinalOrders(customer: StaffCustomerLike): boolean {
  if (customer?.staff_access) return (staffAccessRole(customer) === "super_admin" || canRoleReceiveFinalChargeAccess(staffAccessRole(customer))) && customer.staff_access.final_charge_enabled === true
  if (isSuperAdminCustomer(customer)) return true

  // Final charge is a money action layered on top of a pick/pack role. A stray
  // metadata flag must never grant it to office, merchandising, or customers.
  if (
    !canPickCatchWeightOrders(customer) &&
    !canPackCatchWeightOrders(customer)
  ) {
    return false
  }

  const metadata = (customer?.metadata || {}) as StaffMetadata
  return [
    metadata?.final_charge_enabled,
    metadata?.can_charge_final_orders,
    metadata?.staff_final_charge_enabled,
    metadata?.catch_weight_charge_enabled,
  ].some(truthyStaffValue)
}

export function canRoleReceiveFinalChargeAccess(
  role: StaffAccessRole
): boolean {
  return ["staff", "picker", "packer", "manager", "super_admin"].includes(role)
}

export function canUseOfficeConsole(customer: StaffCustomerLike): boolean {
  const role = staffAccessRole(customer)
  return ["staff", "office", "manager", "super_admin"].includes(role)
}

export function canPickCatchWeightOrders(customer: StaffCustomerLike): boolean {
  const role = staffAccessRole(customer)
  return ["staff", "picker", "packer", "manager", "super_admin"].includes(role)
}

export function canPackCatchWeightOrders(customer: StaffCustomerLike): boolean {
  const role = staffAccessRole(customer)
  return ["staff", "packer", "manager", "super_admin"].includes(role)
}

export function canManageOrderSupport(customer: StaffCustomerLike): boolean {
  const role = staffAccessRole(customer)
  return ["staff", "office", "manager", "super_admin"].includes(role)
}

export function canReviewMerchandising(customer: StaffCustomerLike): boolean {
  const role = staffAccessRole(customer)
  return [
    "staff",
    "office",
    "manager",
    "merchandising_reviewer",
    "super_admin",
  ].includes(role)
}

export function isExplicitStaffDeny(value: unknown): boolean {
  return falseyStaffValue(value)
}

export function staffRoleLabel(role: StaffAccessRole): string {
  return STAFF_ROLE_OPTIONS.find((option) => option.value === role)?.label || role
}

export function staffRoleConfirmation(role: StaffAccessRole): string {
  return (
    STAFF_ROLE_OPTIONS.find((option) => option.value === role)?.confirmation || ""
  )
}

export function staffDisplayName(
  customer:
    | Pick<HttpTypes.StoreCustomer, "first_name" | "last_name" | "email">
    | null
    | undefined
): string {
  const name = [customer?.first_name, customer?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()

  return name || customer?.email || "Grillers Pride staff"
}
