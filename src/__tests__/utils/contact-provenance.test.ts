import { hasCompletedContactVerification, isMigratedCustomer, needsContactVerification, collectPhoneCandidates } from "@lib/util/contact-verification"
import { CONTACT_CONFIRMATION_VERSION } from "@lib/util/customer-contact-state"

const customer=(metadata:any={},created_at:any="2026-09-20T12:00:00Z")=>({created_at,metadata,phone:"4045550100",email:"synthetic@example.invalid",addresses:[]}) as any
const legacy={legacy_source:"legacy_site_customers",legacy_customer_id:"source-late"}
it("prompts late legacy imports even with absent/broken creation dates, never old new-site signups",()=>{
 for(const date of ["2026-09-20T12:00:00Z",null,"broken"]){expect(isMigratedCustomer(customer(legacy,date))).toBe(true);expect(needsContactVerification(customer(legacy,date))).toBe(true)}
 expect(needsContactVerification(customer({},"2025-01-01T00:00:00Z"))).toBe(false)
})
it("preserves genuine old confirmations and current versioned attestations",()=>{
 expect(needsContactVerification(customer({...legacy,contact_verified_version:"contact-verify-v1-2026-07-07",contact_verified_at:"2026-07-08T12:00:00Z"}))).toBe(false)
 expect(hasCompletedContactVerification(customer({contact_verified_at:"bad"}))).toBe(false)
 expect(hasCompletedContactVerification(customer({contact_confirmation_v2:{version:CONTACT_CONFIRMATION_VERSION,status:"confirmed",confirmed_at:"2026-09-20T12:00:00Z"}}))).toBe(true)
})
it("deduplicates historical formats without merging accounts",()=>{
 const c=customer(legacy);c.addresses=[{phone:"+1 (404) 555-0100",address_1:"1 Test Street"},{phone:"7705550100",address_1:"2 Test Street"}]
 expect(collectPhoneCandidates(c).map(p=>p.value)).toEqual(["4045550100","7705550100"])
})
