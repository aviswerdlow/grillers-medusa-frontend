import { fireEvent, render, screen } from "@testing-library/react"
import ProfilePhone from "@modules/account/components/profile-phone"
jest.mock("@lib/data/primary-contact", () => ({ updatePrimaryContact: jest.fn() }))
jest.mock("@modules/account/components/account-info", () => ({ __esModule: true, default: ({children}: any) => <div>{children}</div> }))
jest.mock("react", () => ({ ...jest.requireActual("react"), useActionState: () => [{success:false,error:null},jest.fn()] }))
const customer = { id:"cus_test",phone:"4045550100",metadata:{} } as any
beforeEach(() => { Object.defineProperty(globalThis.crypto,"randomUUID",{configurable:true,value:()=>"synthetic-request-0001"}) })
it("shows current authoritative consent, then clears it on a phone edit",()=>{
 render(<ProfilePhone customer={customer} marketingStatus={{status:"subscribed",phone:"4045550100",consented_at:"2026-01-01T00:00:00Z",opted_out_at:null}} />)
 expect(screen.getByRole("checkbox")).toBeChecked()
 fireEvent.change(screen.getByTestId("phone-input"),{target:{value:"7705550100"}})
 expect(screen.getByRole("checkbox")).not.toBeChecked()
})
it.each([null,{status:"unsubscribed",phone:"4045550100"},{status:"subscribed",phone:"7705550100"}])("does not infer consent from unavailable, stopped or different-phone status %p",status=>{
 render(<ProfilePhone customer={customer} marketingStatus={status as any} />)
 expect(screen.getByRole("checkbox")).not.toBeChecked()
 if (!status) expect(screen.getByRole("checkbox")).toBeDisabled()
})
