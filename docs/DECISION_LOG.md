# Design & UI decision log

Append-only notes for significant UI/UX and design-system choices in **armada-poc** (`@armada/ui`, `armada-interface`). Use when onboarding teammates, reviewing PRs, or avoiding repeated drift.

---

## 2026-05-30 — Typography composites, onboarding polish, modal alignment

### Context

Work spanned **UnlockFlow** (paste secret / backup), **onboarding** setup steps, and cross-project comparison with **armada-crowdfund**. Several issues surfaced:

1. **Typography drift** — Step titles used hand-picked `fontSize-2xl` (24px) and `fontWeight-regular` (400) while Figma / `armada-tokens.json` defined `ui/heading-sm` as 17px, Medium (500), with a different line height in JSON (`lineHeight.snug` ≈ 120%).
2. **Partial token usage** — Colors and spacing often came from `--semantic-*` / `--primitives-*`, but composite typography in `armada-tokens.json` was never emitted to CSS, so implementers guessed per screen.
3. **Modal surface mismatch** — `@armada/interface` `Modal` used `surface-raised` + `border-default`; crowdfund flow shells use `surface-default` for the 480×500 card.
4. **Unlock / onboarding UX** — Paste control, tooltip pattern, spacing, footer button sizes, and “create new account” placement were iterated in product review.

### Problem statement (typography)

| Layer | What existed | What broke down |
|--------|----------------|-----------------|
| `armada-tokens.json` | `semantic.typography.ui.heading-sm` (composite) | Not consumed by CSS build |
| `tokens.css` | Primitives + semantic colors/spacing | No `--semantic-typography-*` vars |
| Component CSS | Per-step `.title` / `.headline` blocks | Copy-paste; easy to get size/weight wrong |
| Design doc | Primitive scale table only | No composite table (`ui/heading-sm`, etc.) |

**Symptom:** Some values matched the design system (e.g. correct surface token), others did not (title weight Regular instead of Medium). Same root cause: **only part of the DS is machine-enforced.**

### Decisions

#### D1 — Emit typography composites from the token build

**Decision:** Add `packages/ui/scripts/build-typography.mjs` to generate:

- `src/styles/typography.css` — per-composite CSS variables (`--semantic-typography-{group}-{name}-{property}`) and utility classes (`.armada-text-{group}-{name}`)
- `src/typography/variants.ts` — `TypographyVariant` union + `typographyClassName()`

**Rationale:** Single source of truth stays `armada-tokens.json`. CSS and TypeScript stay in sync when composites change. Regenerate via `npm run tokens:typography --workspace=@armada/ui`.

**Not in scope (yet):** Full regeneration of `tokens.css` (colors, spacing, components) from JSON — still hand-maintained per `tokens.css` header.

---

#### D2 — Shared React primitives for composites

**Decision:** Add `@armada/ui`:

- `Text` — `variant` prop maps to generated composites
- `HeadingSm` — thin wrapper for `ui/heading-sm` (default `h3`)

Onboarding steps use `<HeadingSm>` instead of local `.title` CSS. Removed `OnboardingTypography.module.css`.

**Rationale:** Prefer a named primitive over repeating `className="armada-text-ui-heading-sm"` or duplicating five properties in every module.

**Alternatives considered:**

| Option | Why not |
|--------|---------|
| Only global utility classes | Easy to forget class name; no TS autocomplete |
| Only CSS variables | Callers still assemble 5 properties manually |
| Charis SIL on step titles | Functional flow copy = Geist per DS |

---

#### D3 — `ui/heading-sm` spec: 17px / 24px line-height / Medium

**Decision:** Align token + implementation to:

- **Size:** 17px (`fontSize.lg`)
- **Line height:** 24px (`spacing.6` → `var(--primitives-spacing-6)`)
- **Weight:** Medium (500)

Updated `semantic.typography.ui.heading-sm.lineHeight` from `{lineHeight.snug}` to `{spacing.6}` in `armada-tokens.json` so generated CSS matches Figma **17/24** shown in review.

**Rationale:** Product review targeted 17/24 from Figma `ui/heading-sm`. Snug (120% of 17px ≈ 20px) was token-default but not what we shipped in UI.

**Note:** Semibold (600) was discussed; **not** adopted — composite token specifies **Medium**. Semibold remains available as `--primitives-fontWeight-semibold` for explicit overrides only.

---

#### D4 — Document composites in the design system

**Decision:**

- `packages/ui/TYPOGRAPHY.md` — usage, regeneration, composite table
- `armada-crowdfund/ARMADA_DESIGN_SYSTEM.md` — new “Typography composites” section (crowdfund is the written DS reference for both apps)

**Rationale:** Prevents “check tokens.css for fontSize-lg” without learning weight/line-height. Documents the **bundle**, not just primitives.

---

#### D5 — Modal chrome aligned with crowdfund flow shells

**Decision:** `@armada/interface` `Modal` dialog:

- **Background:** `--semantic-color-surface-default` (was `surface-raised`)
- **Border:** `--semantic-color-border-default` (white @ 7% opacity — **not** lavender)
- **Radius:** `--semantic-borderRadius-modal` (20px)
- **Backdrop:** `color-mix(surface-bg 72%, transparent)` (crowdfund pattern)

**Rationale:** User asked modals to match crowdfund card fill. Explicit follow-up: **borders for modals/cards are never lavender** — only `border-default`.

**Unlock “create new account” copy:** Rendered **outside** the modal card via `Modal` `belowDialog` / `OnboardingShell` `below`, with **24px** gap (`spacing.6`).

---

#### D6 — Unlock / onboarding UI patterns (summary)

| Topic | Decision |
|--------|-----------|
| Info icon + tooltip | Crowdfund pattern: `Tooltip` + `InformationCircleIcon` (solid path inline SVG in interface; no `@heroicons` dep in app) |
| Paste control | `@armada/ui` `Button` secondary `sm`, no icon |
| Footer CTAs | `FlowFooter` already **MD** (40px); full-width layout can look larger — size unchanged |
| Step indicator gap (labels ↔ bar) | **12px** (`spacing.3`) — crowdfund `Steps` parity |
| Modal footer gap (content ↔ buttons) | **24px** (`spacing.6`) via grouped fields + footer margin |

---

### Surface hierarchy (reference)

Documented during review — avoids mixing “background” and “surface”:

| Token | Hex | Role |
|--------|-----|------|
| `surface-bg` | `#0E0D0F` | Page canvas, modal backdrop base |
| `surface-default` | `#151416` | Cards, flow shells, **modal dialog** |
| `surface-raised` | `#1D1C1F` | Nested blocks on cards, tooltips |

Page background is **`surface-bg`**, not `surface-default`.

---

### How to work with this going forward

1. **New step title** → `<HeadingSm>` (or `<Text variant="ui-heading-sm" />`), not custom font-size in CSS.
2. **Change a composite** → edit `armada-tokens.json` → run `npm run tokens:typography` → commit JSON + generated files.
3. **Do not hand-edit** `typography.css` or `variants.ts`.
4. **New modal/card** → `surface-default` + `border-default` + `borderRadius-modal` unless design specifies a nested `raised` panel inside.

### Files touched (main)

| Area | Paths |
|------|--------|
| Token build | `packages/ui/scripts/build-typography.mjs`, `src/styles/typography.css`, `src/typography/variants.ts` |
| Primitives | `packages/ui/src/components/Text/`, `HeadingSm/`, `package.json` (`tokens:typography`) |
| Onboarding | `apps/armada-interface/.../onboarding/steps/*`, removed `OnboardingTypography.module.css` |
| Modal | `apps/armada-interface/.../ui/Modal/*`, `OnboardingShell` (`below` slot) |
| Docs | `packages/ui/TYPOGRAPHY.md`, `ARMADA_DESIGN_SYSTEM.md`, `packages/ui/CLAUDE.md` |
| Tests | `vitest.config.ts` — added `@vitejs/plugin-react` so workspace `@armada/ui` JSX runs in tests |

### Open follow-ups

- **Crowdfund participate `.title` blocks** still use hand-maintained CSS (`fontSize-xl` / `2xl` in places) — not migrated to `@armada/ui` composites.
- **Full `tokens.css` codegen** from JSON — still deferred; only typography composites are generated today.
- **WelcomeStep test** — “Restore” button label is **“I have a backup”**; one test still queries `/restore/i` (pre-existing mismatch).

### Related reading

- [`packages/ui/TYPOGRAPHY.md`](../packages/ui/TYPOGRAPHY.md)
- [`ARMADA_DESIGN_SYSTEM.md`](../../armada-crowdfund/ARMADA_DESIGN_SYSTEM.md) (typography composites section)
- [`packages/ui/CLAUDE.md`](../packages/ui/CLAUDE.md)
