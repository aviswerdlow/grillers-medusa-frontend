import { deferContactVerification, isContactVerificationDeferred } from "@lib/data/contact-verification-deferral"
import { skipContactVerification } from "@lib/data/contact-verification"
import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import { getStaffImpersonationSession } from "@lib/data/staff/impersonation"
import { cookies } from "next/headers"
import { sdk } from "@lib/config"
jest.mock("next/headers",()=>({cookies:jest.fn()}))
jest.mock("next/cache",()=>({revalidateTag:jest.fn()}))
jest.mock("@lib/data/cookies",()=>({getAuthHeaders:jest.fn(),getCacheTag:async()=>"fixture"}))
jest.mock("@lib/data/customer",()=>({retrieveCustomer:jest.fn(),addCustomerAddress:jest.fn()}))
jest.mock("@lib/data/staff/impersonation",()=>({getStaffImpersonationSession:jest.fn()}))
jest.mock("@lib/data/receipt-email",()=>({requestReceiptEmailCode:jest.fn()}))
jest.mock("@lib/ops-alert",()=>({emitStorefrontOpsAlert:jest.fn()}))
jest.mock("@lib/config",()=>({sdk:{client:{fetch:jest.fn()}}}))
const jar=new Map<string,string>();const set=jest.fn((key,value)=>jar.set(key,value))
beforeEach(()=>{jest.clearAllMocks();jar.clear();(cookies as jest.Mock).mockResolvedValue({set,get:(key:string)=>({value:jar.get(key)})});(getAuthHeaders as jest.Mock).mockResolvedValue({authorization:"Bearer synthetic-session-one"});(retrieveCustomer as jest.Mock).mockResolvedValue({id:"cus_fixture",metadata:{}});(getStaffImpersonationSession as jest.Mock).mockResolvedValue(null)})
test("deferral permits one customer session without persisting confirmation or consent",async()=>{expect(await skipContactVerification()).toEqual({ok:true});expect(await isContactVerificationDeferred("cus_fixture")).toBe(true);expect(await isContactVerificationDeferred("cus_other")).toBe(false);expect(sdk.client.fetch).not.toHaveBeenCalled();expect(set).toHaveBeenCalledWith("_gp_contact_deferred",expect.stringMatching(/^[0-9a-f]{64}$/),expect.objectContaining({httpOnly:true,sameSite:"lax",path:"/"}));expect(set.mock.calls[0][1]).not.toContain("synthetic-session")})
test("new login and missing login cannot reuse a previous deferral",async()=>{await deferContactVerification("cus_fixture");(getAuthHeaders as jest.Mock).mockResolvedValue({authorization:"Bearer synthetic-session-two"});expect(await isContactVerificationDeferred("cus_fixture")).toBe(false);(getAuthHeaders as jest.Mock).mockResolvedValue({});expect(await isContactVerificationDeferred("cus_fixture")).toBe(false);await expect(deferContactVerification("cus_fixture")).rejects.toThrow()})
test("staff, missing customer and session errors never defer on someone else's behalf",async()=>{(getStaffImpersonationSession as jest.Mock).mockResolvedValueOnce({});expect(await skipContactVerification()).toEqual({ok:false});(retrieveCustomer as jest.Mock).mockResolvedValueOnce(null);expect(await skipContactVerification()).toEqual({ok:false});(getStaffImpersonationSession as jest.Mock).mockRejectedValueOnce(new Error("unknown"));expect(await skipContactVerification()).toEqual({ok:false});expect(set).not.toHaveBeenCalled()})
