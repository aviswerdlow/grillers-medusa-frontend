import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

/**
 * WCAG 2.1 AA Accessibility Audit Tests
 * Uses axe-core for automated accessibility testing
 */

test.describe("Accessibility Audit - WCAG 2.1 AA", () => {
  test.describe("Homepage", () => {
    test("should not have any automatically detectable accessibility issues", async ({
      page,
    }) => {
      await page.goto("/us")
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })

    test("should have proper color contrast", async ({ page }) => {
      await page.goto("/us")
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2aa"])
        .options({ rules: { "color-contrast": { enabled: true } } })
        .analyze()

      const contrastViolations = accessibilityScanResults.violations.filter(
        (v) => v.id === "color-contrast"
      )
      expect(contrastViolations).toEqual([])
    })
  })

  test.describe("Navigation", () => {
    test("should have accessible navigation", async ({ page }) => {
      await page.goto("/us")
      
      // Check for skip link
      const skipLink = page.locator("a[href='#main-content']")
      await expect(skipLink).toBeAttached()

      // Check for landmark regions
      const mainNav = page.locator("nav")
      await expect(mainNav.first()).toBeVisible()

      // Check for accessible menu buttons
      const menuButtons = page.locator("button[aria-haspopup='true']")
      const count = await menuButtons.count()
      
      for (let i = 0; i < count; i++) {
        const button = menuButtons.nth(i)
        await expect(button).toHaveAttribute("aria-expanded")
      }
    })

    test("should support keyboard navigation", async ({ page }) => {
      await page.goto("/us")
      
      // Tab through focusable elements
      await page.keyboard.press("Tab")
      
      // First focusable element should have focus
      const focusedElement = page.locator(":focus")
      await expect(focusedElement).toBeVisible()
    })
  })

  test.describe("Forms", () => {
    test("newsletter form should be accessible", async ({ page }) => {
      await page.goto("/us")
      
      // Find newsletter form (usually in footer)
      const emailInput = page.locator("input[type='email']").first()
      
      if (await emailInput.isVisible()) {
        // Check for associated label
        const inputId = await emailInput.getAttribute("id")
        if (inputId) {
          const label = page.locator(`label[for='${inputId}']`)
          await expect(label).toBeAttached()
        }

        // Check for required attribute
        await expect(emailInput).toHaveAttribute("required")
      }
    })
  })

  test.describe("Images", () => {
    test("all images should have alt text", async ({ page }) => {
      await page.goto("/us")
      
      const images = page.locator("img")
      const count = await images.count()

      for (let i = 0; i < count; i++) {
        const img = images.nth(i)
        const alt = await img.getAttribute("alt")
        // Alt attribute must exist (can be empty for decorative images)
        expect(alt).not.toBeNull()
      }
    })
  })

  test.describe("Product Page", () => {
    test("should not have accessibility issues", async ({ page }) => {
      // Navigate to a product page (adjust URL as needed)
      await page.goto("/us/store")
      
      // Click on first product if available
      const productLink = page.locator("a[href*='/products/']").first()
      if (await productLink.isVisible()) {
        const productHref = await productLink.getAttribute("href")
        expect(productHref).toBeTruthy()

        await page.goto(productHref!)
        await page.waitForLoadState("networkidle")
        await expect(page.locator("#__next_error__")).toHaveCount(0)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

        const accessibilityScanResults = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()

        expect(accessibilityScanResults.violations).toEqual([])
      }
    })
  })

  test.describe("Cart Page", () => {
    test("should not have accessibility issues", async ({ page }) => {
      await page.goto("/us/cart")
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })
  })

  test.describe("Mobile Accessibility", () => {
    test("should be accessible on mobile viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto("/us")
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()

      expect(accessibilityScanResults.violations).toEqual([])
    })

    test("mobile menu should be accessible", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto("/us")
      
      // Open mobile menu
      const menuButton = page.locator("button[aria-label*='menu' i], button[aria-label*='navigation' i]").first()
      if (await menuButton.isVisible()) {
        await menuButton.click()
        
        // Check menu is visible and accessible
        const menu = page.locator("[role='dialog'], nav").first()
        await expect(menu).toBeVisible()
      }
    })
  })
})
