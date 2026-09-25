"use client"

import { Badge, Heading, Input, Label, Text, clx } from "@medusajs/ui"
import React, { useActionState } from "react"

import { applyPromotions, submitPromotionForm } from "@lib/data/cart"
import { jitsuTrack } from "@lib/jitsu"
import { convertToLocale, toMoneyAmount } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import Trash from "@modules/common/icons/trash"
import ErrorMessage from "../error-message"
import { SubmitButton } from "../submit-button"

type DiscountCodeProps = {
  cart: HttpTypes.StoreCart & {
    promotions: HttpTypes.StorePromotion[]
  }
  variant?: "light" | "dark"
}

const DiscountCode: React.FC<DiscountCodeProps> = ({ cart, variant = "light" }) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const isDark = variant === "dark"

  const { promotions: rawPromotions = [] } = cart
  // Auto-applied promotions (free-shipping + pickup credits) are managed by
  // dedicated client managers based on fulfillment + subtotal. Surfacing them
  // here as removable chips would let a customer delete the promo and lose
  // the savings without realizing it. The summary already advertises the
  // unlocked benefit in plain language.
  const HIDDEN_PROMO_CODES = [
    "GP_FREESHIP_INREGION",
    "GP_FREESHIP_NATIONAL",
    "GP_SE_PICKUP_CREDIT",
    "PLANTPICKUP750",
  ]
  const promotions = rawPromotions.filter(
    (p) => !p.code || !HIDDEN_PROMO_CODES.includes(p.code)
  )
  const removePromotionCode = async (code: string) => {
    const validPromotions = promotions.filter(
      (promotion) => promotion.code !== code
    )

    await applyPromotions(
      validPromotions.filter((p) => p.code === undefined).map((p) => p.code!)
    )
  }

  const addPromotionCode = async (formData: FormData) => {
    const code = formData.get("code")
    if (!code) {
      return
    }
    const input = document.getElementById("promotion-input") as HTMLInputElement
    const codes = promotions
      .filter((p) => p.code === undefined)
      .map((p) => p.code!)
    codes.push(code.toString())

    await applyPromotions(codes)

    jitsuTrack("coupon_applied", {
      coupon_code: code.toString(),
      cart_id: cart.id,
      success: true,
    })

    if (input) {
      input.value = ""
    }
  }

  const [message] = useActionState(submitPromotionForm, null)

  return (
    <div className={clx("w-full flex flex-col", {
      "bg-white": !isDark,
      "bg-transparent": isDark,
    })}>
      <div className="txt-medium">
        <form action={(a) => addPromotionCode(a)} className="w-full">
          <Label className="flex gap-x-1 items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              type="button"
              className={clx("txt-medium underline", {
                "text-ui-fg-interactive hover:text-ui-fg-interactive-hover": !isDark,
                "text-Gold hover:text-Gold/80": isDark,
              })}
              data-testid="add-discount-button"
            >
              Add Promotion Code
            </button>
          </Label>

          {isOpen && (
            <div className="mt-3">
              <div className="flex w-full gap-x-2">
                <input
                  className={clx(
                    "flex-1 px-3 py-2 text-sm rounded-md border focus:outline-none focus:ring-2 focus:ring-Gold",
                    {
                      "bg-white border-gray-300 text-gray-900": !isDark,
                      "bg-gray-700 border-gray-600 text-white placeholder-gray-400": isDark,
                    }
                  )}
                  id="promotion-input"
                  name="code"
                  type="text"
                  placeholder="Enter code"
                  autoFocus={false}
                  data-testid="discount-input"
                />
                <SubmitButton
                  variant="secondary"
                  className={clx({
                    "bg-gray-600 text-white hover:bg-gray-500 border-gray-600": isDark,
                  })}
                  data-testid="discount-apply-button"
                >
                  Apply
                </SubmitButton>
              </div>

              <ErrorMessage
                error={message}
                data-testid="discount-error-message"
              />
            </div>
          )}
        </form>

        {promotions.length > 0 && (
          <div className="w-full flex items-center mt-4">
            <div className="flex flex-col w-full">
              <Heading className={clx("txt-medium mb-2", {
                "text-white": isDark,
              })}>
                Promotion(s) applied:
              </Heading>

              {promotions.map((promotion) => {
                const promotionAmount = toMoneyAmount(
                  promotion.application_method?.value
                )
                return (
                  <div
                    key={promotion.id}
                    className="flex items-center justify-between w-full max-w-full mb-2"
                    data-testid="discount-row"
                  >
                    <Text className={clx("flex gap-x-1 items-baseline txt-small-plus w-4/5 pr-1", {
                      "text-gray-300": isDark,
                    })}>
                      <span className="truncate" data-testid="discount-code">
                        <Badge
                          color={promotion.is_automatic ? "green" : "grey"}
                          size="small"
                        >
                          {promotion.code}
                        </Badge>{" "}
                        (
                        {promotion.application_method?.value !== undefined &&
                          promotion.application_method.currency_code !==
                            undefined && (
                            <>
                              {promotion.application_method.type ===
                              "percentage"
                                ? promotionAmount === null
                                  ? "—"
                                  : `${promotionAmount}%`
                                : convertToLocale({
                                    amount: promotion.application_method.value,
                                    currency_code:
                                      promotion.application_method
                                        .currency_code,
                                  })}
                            </>
                          )}
                        )
                      </span>
                    </Text>
                    {!promotion.is_automatic && (
                      <button
                        className={clx("flex items-center", {
                          "text-gray-400 hover:text-white": isDark,
                        })}
                        onClick={() => {
                          if (!promotion.code) {
                            return
                          }

                          removePromotionCode(promotion.code)
                        }}
                        data-testid="remove-discount-button"
                      >
                        <Trash size={14} />
                        <span className="sr-only">
                          Remove discount code from order
                        </span>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DiscountCode
