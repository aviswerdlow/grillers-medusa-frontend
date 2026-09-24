const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: 4 })
    : "Unavailable"
const money = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "Unavailable"
const time = (value: unknown) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "Unavailable"
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  })
}

/** Staff reference only. Never recompute an accepted estimate from live CMS
 * values or treat these estimates as measured packing data or final charges. */
export function PackingEstimate({ metadata }: { metadata?: Record<string, any> }) {
  const plan = metadata?.shipping_packing_plan_v1
  const applied = plan?.appliedPolicy
  if (plan?.version !== 1 || !Array.isArray(plan.packages) || !plan.packages.length || plan.packages.some((box: any) => !box || typeof box !== "object") || !applied?.policy) {
    return <p className="border-b border-gray-200 px-4 py-3 text-sm text-Charcoal/65 sm:px-5">
      Accepted seasonal packing estimate unavailable. Use the office review process for shipping.
    </p>
  }
  return (
    <details className="border-b border-gray-200 bg-white px-4 py-3 text-sm text-Charcoal sm:px-5">
      <summary className="min-h-[40px] cursor-pointer py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-Gold">
        Accepted packing estimate · {number(plan.boxes)} {plan.boxes === 1 ? "box" : "boxes"} · {number(plan.dryIceLb)} lb dry ice
      </summary>
      <div className="space-y-3 pb-2 pt-2">
        <p>This is the estimate accepted with the order. Record actual containers and scale weights separately. If shipment timing or contents changed, have the office review the order before charging.</p>
        <dl className="grid gap-3 break-words sm:grid-cols-2">
          <div><dt className="text-Charcoal/60">Packing policy</dt><dd>{applied.policy.name} · {applied.policy.revision}</dd><dd>Approved by {applied.policy.approvedBy} · {time(applied.policy.approvedAt)}</dd></div>
          <div><dt className="text-Charcoal/60">Coverage</dt><dd>{applied.policy.effectiveFrom} through {applied.policy.effectiveThrough}</dd></div>
          <div><dt className="text-Charcoal/60">Planned packing → arrival</dt><dd>{time(applied.packedAt)} → {time(applied.arrivalBy)}</dd></div>
          <div><dt className="text-Charcoal/60">Cold-chain allowance</dt><dd>{number(applied.elapsedHours)} hours + {number(applied.policy.delayAllowanceHours)} hours delay = {number(applied.exposureHours)} hours</dd></div>
        </dl>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="mb-2 text-left text-sm font-semibold">Estimated boxes, including dry ice and empty-box weight</caption>
            <thead><tr>{["Box", "Dimensions (in)", "Food (lb)", "Ice (lb)", "Empty box (lb)", "Total / limit (lb)", "Space used / capacity"].map(label => <th key={label} className="whitespace-nowrap border-b p-2 font-semibold">{label}</th>)}</tr></thead>
            <tbody>{plan.packages.map((box: any, index: number) => <tr key={index}>
              <td className="border-b p-2">{index + 1}. {box.boxName}</td>
              <td className="whitespace-nowrap border-b p-2">{number(box.lengthIn)} × {number(box.widthIn)} × {number(box.heightIn)}</td>
              <td className="border-b p-2">{number(box.productWeightLb)}</td><td className="border-b p-2">{number(box.dryIceLb)}</td><td className="border-b p-2">{number(box.tareLb)}</td>
              <td className="whitespace-nowrap border-b p-2">{number(box.grossWeightLb)} / {number(box.grossWeightLimitLb)}</td><td className="whitespace-nowrap border-b p-2">{number(box.totalFitUnits)} / {number(box.fitCapacity)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p>Estimated box cost {money(plan.boxCost)} + dry ice cost {money(plan.dryIceCost)} = {money(plan.total)}. Ice price: {money(applied.dryIceUsdPerLb)} per lb. These are packing costs, not the customer&apos;s shipping charge.</p>
        <p className="text-xs text-Charcoal/65">Box space includes food and dry ice in the approved capacity units. Carrier weight is physical food + dry ice + empty box. The accepted estimate stays unchanged when a later policy is published.</p>
      </div>
    </details>
  )
}
