import { test, expect, type Page } from "@playwright/test"

async function dismissCookieBanner(page: Page) {
  const rejectButton = page.getByRole("button", { name: /reject all/i })

  if (await rejectButton.isVisible().catch(() => false)) {
    await rejectButton.click()
    await expect(rejectButton).toBeHidden()
  }
}

test.describe("Homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/us")
    await dismissCookieBanner(page)
  })

  test("should display the hero section", async ({ page }) => {
    // Check for hero section
    const hero = page.locator("section[aria-labelledby='home-hero-heading']")
    await expect(hero).toBeVisible()

    // Check for hero title
    const heroTitle = page.getByRole("heading", { level: 1 })
    await expect(heroTitle).toBeVisible()
  })

  test("should have skip to main content link", async ({ page }) => {
    // Check for skip link (accessibility)
    const skipLink = page.locator("a[href='#main-content']")
    await expect(skipLink).toBeAttached()
  })

  test("should display navigation", async ({ page }) => {
    // Check for main navigation
    const nav = page.locator("nav").first()
    await expect(nav).toBeVisible()

    // Check for logo
    const logoLink = page.getByRole("link", {
      name: /griller's pride home/i,
    })
    await expect(logoLink).toBeVisible()
  })

  test("should have cart button", async ({ page }) => {
    // Check for cart link
    const cartLink = page.locator("[data-testid='nav-cart-link']")
    await expect(cartLink).toBeVisible()
  })
})

test.describe("Navigation", () => {
  test("should navigate to store page", async ({ page }) => {
    await page.goto("/us")
    await dismissCookieBanner(page)

    const storeLink = page.getByRole("link", { name: /shop kosher beef/i })
    await expect(storeLink).toHaveAttribute(
      "href",
      /\/us\/collections\/kosher-beef/
    )
    const storeHref = await storeLink.getAttribute("href")

    await page.goto(storeHref!)
    await expect(page).toHaveURL(/\/collections\/kosher-beef/)
  })

  test("should open cart panel", async ({ page }) => {
    await page.goto("/us")
    await dismissCookieBanner(page)

    const cartLink = page.locator("[data-testid='nav-cart-link']")
    await cartLink.click()

    await expect(page.getByRole("heading", { name: /^Cart$/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /close cart/i })).toBeVisible()
  })
})

test.describe("Search", () => {
  test("should have search functionality on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto("/us")
    await dismissCookieBanner(page)
    
    // Check for search input
    const searchInput = page.locator("input[placeholder*='Search']")
    await expect(searchInput).toBeVisible()
  })

  test("should have mobile search button on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto("/us")
    await dismissCookieBanner(page)
    
    // Check for mobile search button
    const mobileSearchButton = page.locator("button[aria-label='Open search']")
    await expect(mobileSearchButton).toBeVisible()
  })
})

test.describe("Accessibility", () => {
  test("should have proper heading hierarchy", async ({ page }) => {
    await page.goto("/us")
    await dismissCookieBanner(page)
    
    // Check that there's an h1
    const h1 = page.locator("h1")
    await expect(h1).toBeVisible()
  })

  test("should have alt text on images", async ({ page }) => {
    await page.goto("/us")
    await dismissCookieBanner(page)
    
    // Check that visible images have alt attributes
    const images = page.locator("img:visible")
    const count = await images.count()
    
    for (let i = 0; i < Math.min(count, 10); i++) {
      const img = images.nth(i)
      const alt = await img.getAttribute("alt")
      // Alt can be empty string for decorative images, but must exist
      expect(alt).not.toBeNull()
    }
  })
})
