import { HttpTypes } from "@medusajs/types"
import Input from "@modules/common/components/input"
import React, { useEffect, useMemo, useState } from "react"
import CountrySelect from "../country-select"
import { formatPhone, stripPhone } from "@lib/util/format-phone"
import { useFormPersistence } from "@lib/hooks/use-form-persistence"
import AddressAutocomplete from "../address-autocomplete"
import StateSelect from "../state-select"

const BillingAddress = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer?: HttpTypes.StoreCustomer | null
}) => {
  const [formData, setFormData] = useState<any>({
    "billing_address.first_name":
      cart?.billing_address?.first_name || customer?.first_name || "",
    "billing_address.last_name":
      cart?.billing_address?.last_name || customer?.last_name || "",
    "billing_address.address_1": cart?.billing_address?.address_1 || "",
    "billing_address.company": cart?.billing_address?.company || "",
    "billing_address.postal_code": cart?.billing_address?.postal_code || "",
    "billing_address.city": cart?.billing_address?.city || "",
    "billing_address.country_code": cart?.billing_address?.country_code || "",
    "billing_address.province": cart?.billing_address?.province || "",
    "billing_address.phone":
      cart?.billing_address?.phone || customer?.phone || "",
  })

  useFormPersistence("checkout_billing_draft", formData, setFormData)

  const countriesInRegion = useMemo(
    () => cart?.region?.countries?.map((country) => country.iso_2),
    [cart?.region]
  )

  const preferredBillingAddress = useMemo(() => {
    const addressesInRegion = customer?.addresses?.filter(
      (address) =>
        !countriesInRegion?.length ||
        (address.country_code &&
          countriesInRegion.includes(address.country_code.toLowerCase()))
    )
    if (!addressesInRegion?.length) return undefined

    return (
      addressesInRegion.find((address) => address.is_default_billing) ||
      addressesInRegion.find((address) => address.is_default_shipping) ||
      addressesInRegion[0]
    )
  }, [countriesInRegion, customer?.addresses])

  useEffect(() => {
    if (
      !customer ||
      !preferredBillingAddress ||
      cart?.billing_address?.address_1
    ) {
      return
    }

    setFormData((prev: any) => {
      if (prev["billing_address.address_1"]) return prev

      return {
        ...prev,
        "billing_address.first_name":
          preferredBillingAddress.first_name || customer.first_name || "",
        "billing_address.last_name":
          preferredBillingAddress.last_name || customer.last_name || "",
        "billing_address.address_1": preferredBillingAddress.address_1 || "",
        "billing_address.company": preferredBillingAddress.company || "",
        "billing_address.postal_code":
          preferredBillingAddress.postal_code || "",
        "billing_address.city": preferredBillingAddress.city || "",
        "billing_address.country_code":
          preferredBillingAddress.country_code || "",
        "billing_address.province": preferredBillingAddress.province || "",
        "billing_address.phone":
          preferredBillingAddress.phone || customer.phone || "",
      }
    })
  }, [cart?.billing_address?.address_1, customer, preferredBillingAddress])

  // Fill in any empty fields from customer profile (runs after session restore)
  useEffect(() => {
    if (!customer) return
    setFormData((prev: any) => {
      const updates: Record<string, any> = {}
      if (!prev["billing_address.first_name"] && customer.first_name)
        updates["billing_address.first_name"] = customer.first_name
      if (!prev["billing_address.last_name"] && customer.last_name)
        updates["billing_address.last_name"] = customer.last_name
      if (!prev["billing_address.phone"] && customer.phone)
        updates["billing_address.phone"] = customer.phone
      if (Object.keys(updates).length === 0) return prev
      return { ...prev, ...updates }
    })
  }, [customer])

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLInputElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target

    if (name === "billing_address.phone") {
      const digits = stripPhone(value)
      setFormData({ ...formData, [name]: digits })
      return
    }

    setFormData({
      ...formData,
      [name]: value,
    })
  }

  const handleAddressSelect = (fields: {
    address_1: string
    city: string
    province: string
    postal_code: string
    country_code: string
  }) => {
    setFormData((prev: any) => ({
      ...prev,
      "billing_address.address_1": fields.address_1,
      "billing_address.city": fields.city,
      "billing_address.province": fields.province,
      "billing_address.postal_code": fields.postal_code,
      ...(fields.country_code
        ? { "billing_address.country_code": fields.country_code }
        : {}),
    }))
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="First name"
          name="billing_address.first_name"
          autoComplete="given-name"
          value={formData["billing_address.first_name"]}
          onChange={handleChange}
          required
          data-testid="billing-first-name-input"
        />
        <Input
          label="Last name"
          name="billing_address.last_name"
          autoComplete="family-name"
          value={formData["billing_address.last_name"]}
          onChange={handleChange}
          required
          data-testid="billing-last-name-input"
        />
        <div className="col-span-2">
          <AddressAutocomplete
            label="Address"
            name="billing_address.address_1"
            autoComplete="address-line1"
            value={formData["billing_address.address_1"]}
            onChange={handleChange}
            onAddressSelect={handleAddressSelect}
            required
            data-testid="billing-address-input"
          />
        </div>
        <div className="col-span-2">
          <Input
            label="Company (optional)"
            name="billing_address.company"
            value={formData["billing_address.company"]}
            onChange={handleChange}
            autoComplete="organization"
            data-testid="billing-company-input"
          />
        </div>
        <Input
          label="Postal code"
          name="billing_address.postal_code"
          autoComplete="postal-code"
          value={formData["billing_address.postal_code"]}
          onChange={handleChange}
          required
          data-testid="billing-postal-input"
        />
        <Input
          label="City"
          name="billing_address.city"
          autoComplete="address-level2"
          value={formData["billing_address.city"]}
          onChange={handleChange}
          data-testid="billing-city-input"
        />
        <CountrySelect
          name="billing_address.country_code"
          aria-label="Billing country"
          autoComplete="country"
          region={cart?.region}
          value={formData["billing_address.country_code"]}
          onChange={handleChange}
          required
          data-testid="billing-country-select"
        />
        <StateSelect
          name="billing_address.province"
          autoComplete="address-level1"
          value={formData["billing_address.province"]}
          onChange={handleChange}
          data-testid="billing-province-input"
        />
        <Input
          label="Phone"
          name="billing_address.phone"
          autoComplete="tel"
          value={formatPhone(formData["billing_address.phone"])}
          onChange={handleChange}
          data-testid="billing-phone-input"
        />
      </div>
    </>
  )
}

export default BillingAddress
