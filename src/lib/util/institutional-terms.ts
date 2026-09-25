export function canShowInvoiceCheckout(approved: boolean): boolean {
  return process.env.GP_INSTITUTIONAL_TERMS_ENABLED === "true" && approved
}
