# REQUIREMENTS — Restyle accs-b2b-kmanns to look like Watch House

## Goal
Recreate the visual look & feel of https://watchhouse.com/en-us on the `accs-b2b-kmanns`
Adobe Commerce (ACCS) + Edge Delivery Services storefront, while preserving the commerce
capabilities of the drop-ins wired into the main navigation (mini-cart, search, account/login,
wishlist, PLP/PDP, cart, checkout).

## Reference site analysis (Watch House)
- **Aesthetic:** Contemporary luxury / editorial coffee brand. Heavy whitespace, large
  high-quality product photography on neutral backgrounds, minimal UI chrome.
- **Color:** Monochromatic — near-black text on warm off-white/white backgrounds, warm
  neutral grays. Warmth comes from photography (amber/wood), not UI accents.
- **Typography:** Clean, contemporary sans-serif. Minimal, generous letter/line spacing.
- **Header:** Top bar, left/center wordmark logo, primary nav (Merch, Equipment, Visit us,
  About), right-aligned utility icons (search, account, wishlist, cart). Dropdown subnav.
- **Homepage sections (in order):** hero product banner → "Our Houses" locations →
  brand mission tagline → "House favourites" product showcase → featured product grid →
  location highlights → press/media logos → at-home category links → editorial/story feature → footer.

## Current codebase
- AEM Boilerplate Commerce (B2B) EDS storefront.
- Design tokens live in `styles/styles.css` (`:root`, Adobe "adobe-clean" font, gray brand palette).
- Header/footer are EDS blocks (`blocks/header`, `blocks/footer`); commerce drop-ins mounted via
  `blocks/header` (mini-cart, search) and dedicated commerce-* blocks.
- Homepage & nav content authored in DA (Document Authoring) / content bus.

## In scope
- Design-token overhaul (color, typography, spacing) in `styles/styles.css`.
- Header/nav visual redesign (keep drop-in commerce functionality intact).
- Footer restyle.
- Homepage / content block restyle to editorial aesthetic.
- Optional web-font swap to a close editorial match.

## Out of scope
- Backend/catalog data changes (products remain whatever the demo catalog contains).
- Backend integrations, checkout webhooks, App Builder.

## Decisions (Phase 1 answers)
1. **Scope depth:** Theme + header/footer + homepage (full recreation).
2. **Fonts:** Close web-font match (editorial grotesque), self-hosted.
3. **Delivery:** Code changes in repo **and** push homepage/nav/footer content to DA
   (`content.da.live/kmanns/accs-b2b-kmanns/`).

## Key technical constraints discovered
- Header commerce drop-ins (wishlist, mini-cart, search, auth dropdown, company switcher)
  are injected by `blocks/header/header.js` — **do not modify that JS wiring**. Restyle via
  `blocks/header/header.css` and nav content only. This preserves all commerce capability.
- Nav is a DA fragment loaded from `/nav`; footer from a fragment; homepage is the DA root doc.
- DA org/site: `kmanns` / `accs-b2b-kmanns`.

## Phase 1: Complete ✅
Date: 2026-08-13

## Phase 2: Architectural Plan Presented
Date: 2026-08-13
Status: Awaiting User Approval ⏸️

## Phase 2: Complete ✅
User Approved: Yes (approved + added hero video requirement)
Approval Date: 2026-08-13

## Phase 3: Implementation Approach Selected
Approach: Option B — Proceed directly with implementation
Selection Date: 2026-08-13

## Phase 4: Implementation Started
Date: 2026-08-13

## Phase 4: Implementation Complete
Date: 2026-08-13
Delivered:
- styles/styles.css, styles/fonts.css + Hanken Grotesk woff2 (editorial token overhaul)
- blocks/header/header.css (Watch House top bar; commerce JS untouched)
- blocks/footer/footer.css (dark editorial footer)
- blocks/hero/{hero.js,hero.css,_hero.json} (background VIDEO + image support)
- blocks/cards/cards.css (editorial cards) + styles.css section utilities
- DA content pushed + previewed: index (homepage), nav, footer
Verified: Hanken Grotesk loads, drop-ins (cart/search/wishlist/auth) mount & function,
0 broken images, all sections render. NOT published to aem.live (pending user review).
Known: ACCS sandbox catalog returns "no results" (empty/unindexed) — backend, out of scope.

## Phase 4.5: Testing Decision
Status: Testing Completed (browser verification during Option B iteration)
Date: 2026-08-13

### Architectural Plan

**A. Design system (styles/styles.css + styles/fonts.css)**
- New token palette (editorial monochrome + warm off-white):
  - Ink/near-black `#1c1a17`, true black `#000`, warm off-white bg `#f6f3ee`, pure white `#fff`,
    warm neutral grays for borders/muted text, subtle warm accent `#8a6d4b` (used sparingly).
  - Remap existing `--color-brand-*` / `--color-neutral-*` / `--background-color` tokens so all
    drop-ins inherit the new theme automatically (drop-ins read `.dropin-design` tokens).
- Typography: self-hosted editorial grotesque (e.g. "Hanken Grotesk"/"Manrope"-class) via
  `styles/fonts.css` + `fonts/`; retune `--type-*` tokens: lighter display weights, generous
  tracking on headings (uppercase overlines), tighter body. Buttons: squared/low-radius,
  uppercase, letter-spaced (Watch House style) — override `--shape-border-radius-*` and button rules.
- Section rhythm: increase vertical spacing for the airy editorial feel.

**B. Header / navigation (blocks/header/header.css only; header.js untouched)**
- Recreate Watch House top bar: left wordmark, centered/left primary nav, right utility icons
  (search, account, wishlist, cart). Slim, high-contrast, sticky, hover-dropdown mega-subnav.
- Restyle injected drop-in buttons (search/cart/wishlist/account) to match; keep all handlers.
- Optional announcement bar via a section above nav in DA.

**C. Footer (blocks/footer/footer.css + DA footer content)**
- Multi-column editorial footer: brand blurb, nav columns, newsletter, social, legal row.

**D. Content blocks restyle**
- `blocks/cards`, `blocks/columns`, `blocks/carousel`, `product-list-page`,
  `product-details`, `product-recommendations` — CSS-only tuning to editorial aesthetic
  (large imagery, minimal cards, uppercase labels).

**D2. Hero block — add VIDEO support (new requirement)**
- Currently image-only (picture + h1, no JS). Add `blocks/hero/hero.js` decorator that:
  - Detects a video source (a link/href ending in `.mp4`/`.webm`, or a dedicated video field)
    and renders a full-bleed background `<video autoplay muted loop playsinline preload>` with
    the authored image used as `poster`/fallback. Falls back to image-only when no video given.
  - Keeps overlay text (h1 + optional CTA) layered above, matching Watch House's video hero.
- Update `blocks/hero/_hero.json` model: add a "Video URL" field (and keep Image as poster).
- Extend `blocks/hero/hero.css` to size `<video>` like the existing background `<picture>`,
  add a subtle gradient scrim for text legibility, respect `prefers-reduced-motion`
  (pause/hide video, show poster).

**E. Homepage + nav + footer content (push to DA)**
- Author homepage sections mirroring Watch House order: hero → locations/"Our Houses" →
  mission tagline → product showcase ("House favourites") → featured grid →
  press logos → at-home categories → editorial feature.
- Author `/nav` (Merch, Equipment, Visit us, About — mapped to demo catalog categories) and
  `/footer`. Use existing demo product/category links so commerce stays functional.
- Delivery via DA Source API (needs DA auth token) + preview.

**Integration with existing code:** All drop-in tokens are CSS-var driven, so retheming
`styles.css` cascades to every commerce drop-in with zero JS changes. Header/footer keep their
decorate() logic. Content is additive in DA.

**Security:** No credential handling, no new external endpoints. DA push uses user's own IMS
auth (interactive). No secrets committed.

**Performance:** Self-host fonts with `font-display: swap` + preload; keep hero image eager/LCP
optimized; CSS-only changes avoid added JS weight; respect CWV.

**Testing:** Local `aem up` preview + browser visual check across breakpoints; verify mini-cart,
search, account, wishlist still open/function after restyle.

**Delivery workflow:** Work on a new git branch; commit CSS/block changes; push content to DA
and preview. You review before publish.
