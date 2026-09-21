import AccountPage from "../../app/[countryCode]/(main)/account/page"
import { redirect } from "next/navigation"
import { isContactVerificationDeferred } from "@lib/data/contact-verification-deferral"
jest.mock("next/navigation",()=>({redirect:jest.fn(()=>{throw new Error("redirect fixture")})}))
jest.mock("@lib/data/contact-verification-deferral",()=>({isContactVerificationDeferred:jest.fn()}))
jest.mock("@lib/data/customer",()=>({retrieveCustomer:async()=>({id:"cus_fixture",metadata:{legacy_source:"legacy_site_customers",legacy_customer_id:"legacy_fixture"}})}))
jest.mock("@lib/data/staff/impersonation",()=>({getStaffImpersonationSession:async()=>null}))
jest.mock("@lib/data/orders",()=>({listAllOrders:async()=>[],listLegacyCustomerOrders:async()=>({orders:[],count:0})}))
jest.mock("@lib/order-history-ops-alerts",()=>({emitOrderHistoryDataFailureAlert:jest.fn()}))
jest.mock("@modules/account/components/overview",()=>({__esModule:true,default:()=>null}))
jest.mock("@modules/account/templates/login-template",()=>({__esModule:true,default:()=>null}))
beforeEach(()=>jest.clearAllMocks())
test("a deferred customer reaches the account instead of looping back to confirmation",async()=>{(isContactVerificationDeferred as jest.Mock).mockResolvedValue(true);await expect(AccountPage({params:Promise.resolve({countryCode:"us"})})).resolves.toBeTruthy();expect(redirect).not.toHaveBeenCalled();expect(isContactVerificationDeferred).toHaveBeenCalledWith("cus_fixture")})
test("an unconfirmed new session still receives the prompt",async()=>{(isContactVerificationDeferred as jest.Mock).mockResolvedValue(false);await expect(AccountPage({params:Promise.resolve({countryCode:"us"})})).rejects.toThrow("redirect fixture");expect(redirect).toHaveBeenCalledWith("/us/account/verify-contact")})
