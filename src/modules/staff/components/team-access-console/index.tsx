"use client"

import { useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  History,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react"
import Button from "@modules/common/components/button"
import {
  STAFF_ROLE_OPTIONS,
  canRoleReceiveFinalChargeAccess,
  staffRoleConfirmation,
  staffRoleLabel,
  type StaffAccessRole,
} from "@lib/util/staff-access"
import {
  searchStaffTeamUsers,
  updateStaffTeamRole,
  type StaffTeamUser,
} from "@lib/data/staff/team-access"

function fieldClass() {
  return "min-h-[44px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-maison-neue text-Charcoal outline-none transition focus:border-Gold focus:ring-1 focus:ring-Gold"
}

function labelClass() {
  return "text-xs font-maison-neue-mono uppercase text-Charcoal/55"
}

function roleBadgeClass(role: StaffAccessRole) {
  if (role === "super_admin") {
    return "border-Gold bg-Gold/15 text-Charcoal"
  }
  if (role === "manager") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800"
  }
  if (role === "merchandising_reviewer") {
    return "border-violet-200 bg-violet-50 text-violet-800"
  }
  if (role === "picker" || role === "packer") {
    return "border-blue-200 bg-blue-50 text-blue-800"
  }
  if (role === "office") {
    return "border-amber-200 bg-amber-50 text-amber-800"
  }
  if (role === "staff") {
    return "border-Charcoal/25 bg-Charcoal/5 text-Charcoal"
  }
  return "border-gray-200 bg-white text-Charcoal/55"
}

function displayName(user: StaffTeamUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
}

function formatDate(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function StaffTeamAccessConsole({ localMilestonesEnabled = false }: { localMilestonesEnabled?: boolean }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<StaffTeamUser[]>([])
  const [selected, setSelected] = useState<StaffTeamUser | null>(null)
  const [roleDraft, setRoleDraft] = useState<StaffAccessRole>("staff")
  const [finalChargeDraft, setFinalChargeDraft] = useState(false)
  const [reason, setReason] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isSavingRole, setIsSavingRole] = useState(false)
  const searchRequestId = useRef(0)

  const requiredConfirmation = useMemo(
    () => staffRoleConfirmation(roleDraft),
    [roleDraft]
  )
  const roleCanReceiveFinalCharge = useMemo(
    () => canRoleReceiveFinalChargeAccess(roleDraft),
    [roleDraft]
  )
  const finalChargeChecked =
    roleDraft === "super_admin" ||
    (roleCanReceiveFinalCharge && finalChargeDraft)
  const submitBlockReason = useMemo(() => {
    if (!selected) return "Select a customer first."
    if (reason.trim().length < 8) {
      return "Add a short audit reason before updating staff access."
    }
    if (confirmation.trim().toUpperCase() !== requiredConfirmation) {
      return `Type ${requiredConfirmation} to confirm this change.`
    }
    return ""
  }, [confirmation, reason, requiredConfirmation, roleDraft, selected])

  const canSubmit =
    Boolean(selected) && !submitBlockReason

  async function runSearch() {
    const requestId = searchRequestId.current + 1
    searchRequestId.current = requestId
    setError(null)
    setStatus(null)
    setIsSearching(true)

    try {
      const result = await searchStaffTeamUsers(query)
      if (searchRequestId.current !== requestId) return
      if (!result.ok) {
        setResults([])
        setError(result.error || "Customer lookup failed.")
        return
      }

      setResults(result.users)
      if (!result.users.length) {
        setStatus("No matching customers found.")
      }
    } catch (err) {
      if (searchRequestId.current !== requestId) return
      setError("Customer lookup failed. Try again.")
    } finally {
      if (searchRequestId.current === requestId) {
        setIsSearching(false)
      }
    }
  }

  function selectUser(user: StaffTeamUser) {
    setSelected(user)
    setRoleDraft(user.role === "customer" ? "staff" : user.role)
    setFinalChargeDraft(user.finalChargeEnabled)
    setReason("")
    setConfirmation("")
    setError(null)
    setStatus(null)
  }

  async function submitRoleChange() {
    if (!selected) return
    setError(null)
    setStatus(null)
    setIsSavingRole(true)
    try {
      const result = await updateStaffTeamRole({
        customerId: selected.id,
        role: roleDraft,
        finalChargeEnabled: finalChargeDraft,
        reason,
        confirmation,
      })

      if (!result.ok || !result.user) {
        setError(result.error || "Could not update staff access.")
        return
      }

      setSelected(result.user)
      setResults((current) =>
        current.map((user) =>
          user.id === result.user!.id ? result.user! : user
        )
      )
      setRoleDraft(result.user.role)
      setFinalChargeDraft(result.user.finalChargeEnabled)
      setReason("")
      setConfirmation("")
      setStatus(
        `${displayName(result.user)} is now ${staffRoleLabel(
          result.user.role
        )}.`
      )
    } finally {
      setIsSavingRole(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 large:flex-row large:items-start large:justify-between">
          <div>
            <p className="text-xs font-maison-neue-mono uppercase text-Gold">
              Team access
            </p>
            <h2 className="mt-2 text-2xl font-gyst font-bold text-Charcoal">
              Staff and permissions
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-maison-neue text-Charcoal/60">
              Search an existing customer, assign staff access, and keep every
              permission change tied back to the super admin who made it.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-Gold/35 bg-Gold/10 px-3 py-2 text-sm font-maison-neue font-semibold text-Charcoal">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Super admin only
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 small:flex-row small:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className={labelClass()}>Customer lookup</span>
            <input
              className={fieldClass()}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") runSearch()
              }}
              placeholder="Search by email, name, or phone"
              type="search"
            />
          </label>
          <Button
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white"
            isLoading={isSearching}
            onClick={runSearch}
            type="button"
          >
            <Search className="h-4 w-4" aria-hidden />
            Search
          </Button>
        </div>

        {(error || status) && (
          <div
            className={`mt-4 rounded-md border px-4 py-3 text-sm font-maison-neue ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {error || status}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-md border border-gray-100">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px] border-b border-gray-100 bg-SilverPlate/40 px-4 py-3 text-xs font-maison-neue-mono uppercase text-Charcoal/45 md:grid">
            <span>Name</span>
            <span>Contact</span>
            <span>Role</span>
          </div>

          {results.length ? (
            <div className="divide-y divide-gray-100">
              {results.map((user) => (
                <button
                  className={`grid w-full gap-2 px-4 py-4 text-left transition hover:bg-SilverPlate/40 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px] md:items-center ${
                    selected?.id === user.id ? "bg-Gold/10" : "bg-white"
                  }`}
                  key={user.id}
                  onClick={() => selectUser(user)}
                  type="button"
                >
                  <span>
                    <span className="block text-sm font-maison-neue font-semibold text-Charcoal">
                      {displayName(user)}
                    </span>
                    <span className="mt-1 block text-xs font-maison-neue text-Charcoal/50">
                      {user.company || "Customer account"}
                    </span>
                  </span>
                  <span className="text-sm font-maison-neue text-Charcoal/65">
                    <span className="block break-all">{user.email}</span>
                    {user.phone && <span className="block">{user.phone}</span>}
                  </span>
                  <span>
                    <span
                      className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-maison-neue-mono uppercase ${roleBadgeClass(
                        user.role
                      )}`}
                    >
                      {staffRoleLabel(user.role)}
                    </span>
                    {user.finalChargeEnabled && (
                      <span className="mt-1 block w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-maison-neue-mono uppercase text-emerald-800 md:mt-2">
                        Can charge
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[170px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <Users className="h-8 w-8 text-Charcoal/30" aria-hidden />
              <p className="text-sm font-maison-neue text-Charcoal/55">
                Search for a customer to manage staff access.
              </p>
            </div>
          )}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs font-maison-neue-mono uppercase text-Gold">
            Selected customer
          </p>

          {selected ? (
            <div className="mt-4 space-y-5">
              <div>
                <h3 className="text-xl font-gyst font-bold text-Charcoal">
                  {displayName(selected)}
                </h3>
                <p className="mt-1 break-all text-sm font-maison-neue text-Charcoal/55">
                  {selected.email}
                </p>
                <span
                  className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-maison-neue-mono uppercase ${roleBadgeClass(
                    selected.role
                  )}`}
                >
                  Current: {staffRoleLabel(selected.role)}
                </span>
              </div>

              {selected.isBootstrapSuperAdmin && (
                <div className="flex gap-3 rounded-md border border-Gold/35 bg-Gold/10 p-3 text-sm font-maison-neue text-Charcoal">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden
                  />
                  <p>
                    This account is an initial administrator. Changes here take
                    effect and require a fresh sign-in, including after access is restored.
                    A separate recovery administrator can restore access with an audit reason.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <span className={labelClass()}>Assign role</span>
                {STAFF_ROLE_OPTIONS.filter(option => option.value !== "driver" || localMilestonesEnabled).map((option) => (
                  <label
                    className={`flex cursor-pointer gap-3 rounded-md border p-3 transition ${
                      roleDraft === option.value
                        ? "border-Charcoal bg-Charcoal text-white"
                        : "border-gray-200 bg-white text-Charcoal hover:border-Gold/50"
                    }`}
                    key={option.value}
                  >
                    <input
                      checked={roleDraft === option.value}
                      className="mt-1"
                      onChange={() => {
                        setRoleDraft(option.value)
                        if (!canRoleReceiveFinalChargeAccess(option.value)) {
                          setFinalChargeDraft(false)
                        }
                        if (option.value === "super_admin") {
                          setFinalChargeDraft(true)
                        }
                        setConfirmation("")
                      }}
                      type="radio"
                    />
                    <span>
                      <span className="block text-sm font-maison-neue font-semibold">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-xs font-maison-neue opacity-75">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <label
                className={`flex gap-3 rounded-md border p-3 ${
                  !roleCanReceiveFinalCharge
                    ? "border-gray-100 bg-gray-50 text-Charcoal/45"
                    : "border-emerald-200 bg-emerald-50/60 text-Charcoal"
                }`}
              >
                <input
                  checked={finalChargeChecked}
                  className="mt-1"
                  disabled={
                    !roleCanReceiveFinalCharge || roleDraft === "super_admin"
                  }
                  onChange={(event) =>
                    setFinalChargeDraft(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block text-sm font-maison-neue font-semibold">
                    Can charge final orders
                  </span>
                  <span className="mt-1 block text-xs font-maison-neue text-Charcoal/60">
                    {roleCanReceiveFinalCharge
                      ? "Allows this staff member to press Charge Card & Release in Pack & Finalize. Super admins always have this permission."
                      : "Only pick, pack, manager, general staff, and super admin roles can receive final-charge access."}
                  </span>
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className={labelClass()}>Reason required</span>
                <textarea
                  className={`${fieldClass()} min-h-[92px]`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Example: Avi approved merchandising review access for photo QA."
                />
                <span className="text-xs font-maison-neue text-Charcoal/50">
                  Required for the staff access audit log.
                </span>
              </label>

              <label className="flex flex-col gap-1">
                <span className={labelClass()}>
                  Type {requiredConfirmation} to confirm
                </span>
                <input
                  className={fieldClass()}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>

              <Button
                className="min-h-[48px] w-full rounded-md bg-Gold px-4 text-sm font-rexton font-bold uppercase text-Charcoal disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!canSubmit || isSavingRole}
                isLoading={isSavingRole}
                onClick={submitRoleChange}
                type="button"
              >
                Update Staff Access
              </Button>
              {!canSubmit && !isSavingRole && submitBlockReason ? (
                <p className="text-xs font-maison-neue text-Charcoal/55">
                  {submitBlockReason}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm font-maison-neue text-Charcoal/55">
              Select a customer from search results before changing permissions.
            </p>
          )}
        </section>

        {selected?.recentStaffAccessEvents.length ? (
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-Charcoal/50" aria-hidden />
              <h3 className="text-sm font-maison-neue font-semibold text-Charcoal">
                Staff access history
              </h3>
            </div>
            <div className="space-y-3">
              {selected.recentStaffAccessEvents.map((event, index) => (
                <div
                  className="rounded-md border border-gray-100 p-3 text-sm font-maison-neue text-Charcoal/70"
                  key={`${event.at}-${index}`}
                >
                  <p className="font-semibold text-Charcoal">
                    {staffRoleLabel(
                      (event.previous_role || "customer") as StaffAccessRole
                    )}{" "}
                    to{" "}
                    {staffRoleLabel(
                      (event.role || "customer") as StaffAccessRole
                    )}
                  </p>
                  <p className="mt-1 text-xs text-Charcoal/50">
                    {formatDate(event.at)} by {event.staff_actor_email}
                  </p>
                  {event.reason && <p className="mt-2">{event.reason}</p>}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  )
}
