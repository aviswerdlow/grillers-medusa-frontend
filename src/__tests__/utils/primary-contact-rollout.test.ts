import { updatePrimaryContact } from "@lib/data/primary-contact"
import { sdk } from "@lib/config"
import { retrieveCustomer, updateCustomer } from "@lib/data/customer"
import { getStaffImpersonationSession } from "@lib/data/staff/impersonation"
jest.mock("@lib/config",()=>({sdk:{client:{fetch:jest.fn()}}}))
jest.mock("@lib/data/customer",()=>({retrieveCustomer:jest.fn(),updateCustomer:jest.fn()}))
jest.mock("@lib/data/staff/impersonation",()=>({getStaffImpersonationSession:jest.fn()}))
jest.mock("@lib/data/cookies",()=>({getAuthHeaders:async()=>({authorization:"Bearer fixture"}),getCacheTag:async()=>"customer-fixture"}))
jest.mock("next/cache",()=>({revalidateTag:jest.fn()}))
const fetchMock=sdk.client.fetch as jest.Mock
const form=(opted=false)=>{const f=new FormData();f.set("phone","4045550101");f.set("contact_revision","0");f.set("contact_request_id","synthetic-request-01");if(opted)f.set("sms_marketing_opt_in","on");return f}
beforeEach(()=>{jest.resetAllMocks();(getStaffImpersonationSession as jest.Mock).mockResolvedValue(null);(retrieveCustomer as jest.Mock).mockResolvedValue({id:"cus_fixture",metadata:{}});fetchMock.mockRejectedValue({status:404})})
test.each([false,true])("404 preserves phone edits and the actual marketing choice: %s",async opted=>{
 const result=await updatePrimaryContact(null,form(opted));expect(result.success).toBe(true)
 expect(updateCustomer).toHaveBeenCalledWith(expect.objectContaining({phone:"4045550101",metadata:expect.objectContaining({sms_consent:opted,sms_consent_phone:"4045550101"})}))
 const sent=(updateCustomer as jest.Mock).mock.calls[0][0];expect(sent.metadata).not.toHaveProperty("primary_contact_v1");expect(sent.metadata).not.toHaveProperty("contact_confirmation_v2")
 if(opted) expect(sent.metadata).toMatchObject({sms_consent_method:"customer_checkbox",sms_consent_source:"account_profile"})
 expect(result).toHaveProperty("notice",expect.stringContaining("still need confirmation"))
})
test.each([401,403,409,422,500,503])("failure %s cannot downgrade",async status=>{fetchMock.mockRejectedValue({status});expect((await updatePrimaryContact(null,form())).success).toBe(false);expect(updateCustomer).not.toHaveBeenCalled()})
test.each(["primary_contact_v1","contact_confirmation_v2"])("confirmed %s cannot downgrade",async key=>{(retrieveCustomer as jest.Mock).mockResolvedValue({id:"cus_fixture",metadata:{[key]:{version:1}}});expect((await updatePrimaryContact(null,form())).success).toBe(false);expect(updateCustomer).not.toHaveBeenCalled()})
test("successful new endpoint uses no legacy profile update",async()=>{fetchMock.mockResolvedValue({ok:true,revision:1});expect((await updatePrimaryContact(null,form())).success).toBe(true);expect(updateCustomer).not.toHaveBeenCalled()})
test("unknown staff context and a changed staff session fail closed",async()=>{(getStaffImpersonationSession as jest.Mock).mockRejectedValueOnce(new Error("session unavailable"));expect((await updatePrimaryContact(null,form())).success).toBe(false);expect(fetchMock).not.toHaveBeenCalled();(getStaffImpersonationSession as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({staffCustomerId:"staff_fixture"});expect((await updatePrimaryContact(null,form())).success).toBe(false);expect(updateCustomer).not.toHaveBeenCalled()})
