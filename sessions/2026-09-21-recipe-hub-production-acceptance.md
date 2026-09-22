# Recipe hub production acceptance — 2026-09-21

The owner approved merging and production deployment. The branch was fast-forwarded to main without changing an existing worktree.

- Main and deployed commit: bff19fd1871543a58f556bb4f7635384b6d9ad4c.
- Production deployment: dpl_BNsrJdR6oxv9F6zijsQv6irH8V6t.
- Production URL: https://grillers-medusa-frontend.vercel.app/us/recipes
- Vercel build: Ready; logs identify main at bff19fd, and the successful GitHub Vercel status binds the full SHA to the same deployment.
- Production HTML at both tested widths and all nine remaining-image searches contains exactly that deployment ID.
- Full exact-commit CI passed: https://github.com/mintpixels/grillers-medusa-frontend/actions/runs/35677247684
- Production screenshots at 1440 x 900 and 375 x 812 were inspected. Both return HTTP 200, show new kitchen images, have no horizontal overflow or browser page errors, and load all visible card images (38 desktop, 37 mobile; the mobile featured card is hidden).
- Page 1 renders 38 card images: 36 approved kitchen images and two older images. Every card URL matches its published Strapi Image URL.
- All 801 snapshot slugs matched published Strapi recipes. 792 have gp_kitchen_20260909 images; the nine below retain remediated images. Each was verified directly in production HTML using an exact-slug hub search.
- Previous production deployment retained as rollback target: dpl_BNsNt2378L1MneHU7b3aCfqEzaRu.
- No Strapi content edits or production cache invalidation were performed.
- Evidence directory: /Users/aviswerdlow/.codex/visualizations/2026/09/21/01a0c5f0-178c-7883-8ccf-3612c013187c/recipe-hub-live-images/production

| Recipe slug | Strapi documentId |
| --- | --- |
| alle-84-patty-flat-top-burger-service-1-08-12-1-remediated | glds89wlrdf62cejk1c43ujr |
| split-knockwurst-tray-with-sauerkraut-and-roasted-onions-1-06-51-1-remediated | o5w5ppc0lw2s5op40mvs88g5 |
| aarons-turkey-hot-dogs-with-orange-carrot-slaw-1-06-53-1-remediated | pmmi2ab3fysmf9a1ubb0h1ie |
| two-tray-yom-tov-first-cut-with-onion-carrot-gravy-1-03-15-4-remediated | j0n5jfgqzwk50o9pywe5zilv |
| organic-boneless-flanken-strips-with-crisp-potato-tray-1-10-02-4-remediated | slgy2b2n4yc5d0gl5tsoblp6 |
| organic-turkey-breast-patties-with-apple-and-carrot-7-60-19-1-remediated | pztnxht6ciocj89bthnxgtkb |
| grilled-beef-boerewors-with-chakalaka-style-tomato-relish-1-09-11-1-remediated | st4ehz33kvl12qt40kb9bu5t |
| sliced-boerewors-coil-roll-board-with-mango-cabbage-slaw-1-09-11-2-remediated | rii7fqzqcuhnnq264iitzae6 |
| beef-boerewors-coil-with-pap-and-tomato-onion-smoor-1-09-11-2-remediated | hums7goo3a4vu88gwb6qtq5w |

Production verification is complete. This acceptance record is a local documentation commit after deployment; it does not trigger a second production deployment.
