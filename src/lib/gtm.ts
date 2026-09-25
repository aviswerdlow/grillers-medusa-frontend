// Google Tag Manager initialization and helpers
import { toMoneyAmount } from "@lib/util/money"

export type GTMConfig = {
  gtmId: string
  dataLayer?: Record<string, any>[]
  debug?: boolean
}

export function getGTMScripts(config: GTMConfig) {
  const { gtmId, dataLayer = [], debug = false } = config

  // Initialize dataLayer
  const dataLayerScript = `
    window.dataLayer = window.dataLayer || [];
    ${
      dataLayer.length > 0
        ? `window.dataLayer.push(${JSON.stringify(dataLayer)});`
        : ""
    }
    ${
      debug
        ? 'console.log("GTM Debug Mode: dataLayer initialized", window.dataLayer);'
        : ""
    }
  `

  // GTM Head Script
  const gtmHeadScript = `
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','${gtmId}');
  `

  // GTM Body Noscript
  const gtmBodyNoScript = `<iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`

  return {
    dataLayerScript,
    gtmHeadScript,
    gtmBodyNoScript,
  }
}

// GTM Event helpers for ecommerce tracking
export function pushToDataLayer(event: Record<string, any>) {
  if (typeof window !== "undefined" && window.dataLayer) {
    window.dataLayer.push(event)
  }
}

export function trackPageView(url: string) {
  pushToDataLayer({
    event: "page_view",
    page_location: url,
    page_title: document.title,
  })
}

export function trackAddToCart(
  product: any,
  quantity: number,
  titleOverride?: string
) {
  pushToDataLayer({
    event: "add_to_cart",
    ecommerce: {
      items: [
        {
          item_id: product.id,
          item_name: titleOverride || product.title,
          price: toMoneyAmount(product.price) ?? undefined,
          quantity: quantity,
        },
      ],
    },
  })
}

export function trackPurchase(order: any, titleMap?: Record<string, string>) {
  pushToDataLayer({
    event: "purchase",
    ecommerce: {
      transaction_id: order.id,
      value: toMoneyAmount(order.total) ?? 0,
      currency: order.currency_code,
      items: order.items?.map((item: any) => ({
        item_id: item.product_id,
        item_name:
          (titleMap && item.product_id && titleMap[item.product_id]) ||
          item.title,
        price: toMoneyAmount(item.unit_price) ?? 0,
        quantity: item.quantity,
      })),
    },
  })
}

// Track view_item event when viewing a product detail page
export function trackViewItem(product: {
  id: string
  title: string
  price?: number
  currency?: string
  category?: string
  variant?: string
  titleOverride?: string
}) {
  const price = toMoneyAmount(product.price) ?? 0
  pushToDataLayer({
    event: "view_item",
    ecommerce: {
      currency: product.currency || "USD",
      value: price,
      items: [
        {
          item_id: product.id,
          item_name: product.titleOverride || product.title,
          price: toMoneyAmount(product.price) ?? undefined,
          item_category: product.category,
          item_variant: product.variant,
        },
      ],
    },
  })
}

// Track remove_from_cart event
export function trackRemoveFromCart(product: {
  id: string
  title: string
  price?: number
  quantity: number
  currency?: string
  titleOverride?: string
}) {
  const price = toMoneyAmount(product.price) ?? 0
  pushToDataLayer({
    event: "remove_from_cart",
    ecommerce: {
      currency: product.currency || "USD",
      value: price * product.quantity,
      items: [
        {
          item_id: product.id,
          item_name: product.titleOverride || product.title,
          price: toMoneyAmount(product.price) ?? undefined,
          quantity: product.quantity,
        },
      ],
    },
  })
}

// Track begin_checkout event
export function trackBeginCheckout(cart: {
  id: string
  total: number
  currency?: string
  items: Array<{
    id: string
    title: string
    price: number
    quantity: number
  }>
  titleMap?: Record<string, string>
}) {
  pushToDataLayer({
    event: "begin_checkout",
    ecommerce: {
      currency: cart.currency || "USD",
      value: toMoneyAmount(cart.total) ?? 0,
      items: cart.items.map((item) => ({
        item_id: item.id,
        item_name: (cart.titleMap && cart.titleMap[item.id]) || item.title,
        price: toMoneyAmount(item.price) ?? 0,
        quantity: item.quantity,
      })),
    },
  })
}

// Track add_shipping_info event
export function trackAddShippingInfo(cart: {
  total: number
  currency?: string
  shippingTier?: string
  items: Array<{
    id: string
    title: string
    price: number
    quantity: number
  }>
  titleMap?: Record<string, string>
}) {
  pushToDataLayer({
    event: "add_shipping_info",
    ecommerce: {
      currency: cart.currency || "USD",
      value: toMoneyAmount(cart.total) ?? 0,
      shipping_tier: cart.shippingTier,
      items: cart.items.map((item) => ({
        item_id: item.id,
        item_name: (cart.titleMap && cart.titleMap[item.id]) || item.title,
        price: toMoneyAmount(item.price) ?? 0,
        quantity: item.quantity,
      })),
    },
  })
}

// Track add_payment_info event
export function trackAddPaymentInfo(cart: {
  total: number
  currency?: string
  paymentType?: string
  items: Array<{
    id: string
    title: string
    price: number
    quantity: number
  }>
  titleMap?: Record<string, string>
}) {
  pushToDataLayer({
    event: "add_payment_info",
    ecommerce: {
      currency: cart.currency || "USD",
      value: toMoneyAmount(cart.total) ?? 0,
      payment_type: cart.paymentType,
      items: cart.items.map((item) => ({
        item_id: item.id,
        item_name: (cart.titleMap && cart.titleMap[item.id]) || item.title,
        price: toMoneyAmount(item.price) ?? 0,
        quantity: item.quantity,
      })),
    },
  })
}

// Track search event
export function trackSearch(searchTerm: string) {
  pushToDataLayer({
    event: "search",
    search_term: searchTerm,
  })
}

export function trackRecipeHubView(params: {
  totalRecipes?: number
  activeSearch?: string
  activeCategory?: string
  activeDifficulty?: string
  activeBucket?: string
}) {
  pushToDataLayer({
    event: "view_recipe_hub",
    recipe_total: params.totalRecipes,
    active_search: params.activeSearch,
    active_category: params.activeCategory,
    active_difficulty: params.activeDifficulty,
    active_bucket: params.activeBucket,
  })
}

export function trackRecipeView(params: {
  recipeSlug: string
  recipeTitle: string
  categories?: string[]
}) {
  pushToDataLayer({
    event: "view_recipe",
    recipe_slug: params.recipeSlug,
    recipe_title: params.recipeTitle,
    recipe_categories: params.categories,
  })
}

export function trackRecipeFilterApply(params: {
  filterType: string
  filterValue?: string
  source?: string
}) {
  pushToDataLayer({
    event: "recipe_filter_apply",
    filter_type: params.filterType,
    filter_value: params.filterValue,
    source: params.source,
  })
}

export function trackRecipeClick(params: {
  listName: string
  recipe: {
    id?: string
    slug: string
    title: string
    position?: number
  }
}) {
  pushToDataLayer({
    event: "select_recipe",
    item_list_name: params.listName,
    recipe_id: params.recipe.id,
    recipe_slug: params.recipe.slug,
    recipe_title: params.recipe.title,
    index: params.recipe.position,
  })
}

export function trackRecipePrintOrSave(params: {
  action: "print" | "save"
  recipeSlug: string
  recipeTitle: string
}) {
  pushToDataLayer({
    event: "recipe_print_or_save",
    action: params.action,
    recipe_slug: params.recipeSlug,
    recipe_title: params.recipeTitle,
  })
}

// Track view_item_list event for collection/category pages
export function trackViewItemList(params: {
  listId: string
  listName: string
  items: Array<{
    id: string
    title: string
    price?: number
    position?: number
  }>
}) {
  pushToDataLayer({
    event: "view_item_list",
    ecommerce: {
      item_list_id: params.listId,
      item_list_name: params.listName,
      items: params.items.map((item, index) => ({
        item_id: item.id,
        item_name: item.title,
        price: toMoneyAmount(item.price) ?? undefined,
        index: item.position ?? index,
      })),
    },
  })
}

// Track select_item event when clicking a product in a list
export function trackSelectItem(params: {
  listId: string
  listName: string
  product: {
    id: string
    title: string
    price?: number
    position?: number
  }
}) {
  pushToDataLayer({
    event: "select_item",
    ecommerce: {
      item_list_id: params.listId,
      item_list_name: params.listName,
      items: [
        {
          item_id: params.product.id,
          item_name: params.product.title,
          price: toMoneyAmount(params.product.price) ?? undefined,
          index: params.product.position,
        },
      ],
    },
  })
}

// Declare dataLayer on window
declare global {
  interface Window {
    dataLayer: Record<string, any>[]
  }
}
