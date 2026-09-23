import { skipContactVerification, submitContactVerification } from "@lib/data/contact-verification"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ContactVerification from "@modules/account/components/contact-verification"
jest.mock("@lib/data/contact-verification",()=>({submitContactVerification:jest.fn(),skipContactVerification:jest.fn()}))
jest.mock("@lib/jitsu",()=>({jitsuTrack:jest.fn()}))
jest.mock("next/navigation",()=>({useRouter:()=>({push:jest.fn(),refresh:jest.fn()}),useParams:()=>({countryCode:"us"})}))
jest.mock("@modules/checkout/components/submit-button",()=>({SubmitButton:({children,...props}:any)=><button {...props}>{children}</button>}))
beforeEach(()=>{Object.defineProperty(globalThis.crypto,"randomUUID",{configurable:true,value:()=>"synthetic-request-0001"})})
it("offers one primary destination and keyboard-operable optional marketing with truthful copy",async()=>{
 const user=userEvent.setup()
 render(<ContactVerification customer={{id:"cus_test",email:"synthetic@example.invalid",metadata:{},addresses:[{id:"addr_test",address_1:"1 Test Street"}]} as any}
 marketingStatus={{status:"not_subscribed",phone:null,consented_at:null,opted_out_at:null}} countryCode="us" phoneCandidates={[{value:"4045550100",sources:["account"]},{value:"7705550100",sources:["saved address"]}]} />)
 expect(screen.getByRole("checkbox")).not.toBeChecked()
 expect(screen.getByText(/does not verify ownership by text/)).toBeInTheDocument()
 await user.click(screen.getByRole("radio",{name:/A different number/}))
 const phone=screen.getByLabelText(/Mobile number/);expect(phone).toHaveAttribute("id","primary_phone_other")
 await user.type(phone,"4045550101")
 await user.tab();expect(screen.getByRole("checkbox")).toHaveFocus()
 expect(screen.getAllByRole("radio").filter(r=>(r as HTMLInputElement).name==="primary_phone"&&(r as HTMLInputElement).checked)).toHaveLength(1)
 expect(screen.getByRole("button",{name:/Confirm/})).toBeEnabled()
})
it("associates new-address fields and exposes an accessible error region",async()=>{
 render(<ContactVerification customer={{id:"cus_test",email:"synthetic@example.invalid",metadata:{},addresses:[]} as any} countryCode="us" phoneCandidates={[]} />)
 expect(screen.getByLabelText(/First name/)).toHaveAttribute("id")
 expect(screen.getByLabelText(/Street address/)).toHaveAttribute("id")
 expect(screen.getByRole("alert")).toBeInTheDocument()
})

it("can defer without submitting invalid or missing contact fields",async()=>{
 const user=userEvent.setup();(skipContactVerification as jest.Mock).mockResolvedValue({ok:true})
 render(<ContactVerification customer={{id:"cus_test",email:"synthetic@example.invalid",metadata:{},addresses:[]} as any} countryCode="us" phoneCandidates={[]} />)
 await user.click(screen.getByRole("button",{name:"Do this later"}))
 expect(skipContactVerification).toHaveBeenCalledTimes(1);expect(submitContactVerification).not.toHaveBeenCalled()
})


it("preserves the subscribed current phone and clears consent for a different destination",async()=>{
 const user=userEvent.setup()
 render(<ContactVerification customer={{id:"cus_test",email:"synthetic@example.invalid",metadata:{},addresses:[]} as any} countryCode="us"
 marketingStatus={{status:"subscribed",phone:"4045550100",consented_at:"2026-01-01T00:00:00Z",opted_out_at:null}}
 phoneCandidates={[{value:"4045550100",sources:["account"]},{value:"7705550100",sources:["saved address"]}]} />)
 expect(screen.getByRole("checkbox")).toBeChecked()
 await user.click(screen.getByRole("radio",{name:/770/}))
 expect(screen.getByRole("checkbox")).not.toBeChecked()
})
