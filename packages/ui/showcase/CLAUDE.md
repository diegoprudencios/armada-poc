# @armada/ui-showcase

Internal Vite app that renders every primitive from `@armada/ui` on a single page. Sole purpose: **pixel-comparison against the mockup** at `/Volumes/T7/armada-crowdfund`.

This app is not user-facing, not deployed, not part of any product — it's a developer tool. Do not add product features here. If you find yourself adding business logic or product copy, stop.

## How to use it

```bash
# From the repo root
npm run ui:showcase            # serves on http://localhost:5180/
```

Open the mockup in another tab:
```bash
# In a separate terminal, at /Volumes/T7/armada-crowdfund
npm run dev                    # mockup defaults to port 5173
```

Then visually compare each section of the showcase against the equivalent piece of the mockup. Any divergence is a regression in `@armada/ui` — fix it at the source (tokens, port, or component CSS), never by tweaking the showcase.

## Port choice

`5180`, set in `vite.config.ts` with `strictPort: true`. Chosen to avoid:
- Mockup default (`5173`)
- Crowdfund observer (`5173`)
- Crowdfund committer (`5174`)
- Crowdfund admin (`5175`)

If `5180` ever collides with something else, change it here and update this note — don't fall back to a different port silently.

## What's rendered

Every primitive exported from `@armada/ui`, in labelled sections:

- Buttons — 4 variants × 3 sizes, with/without icon, disabled state
- Tags — base + every status-dot variant
- Nav — NavItem in isolation + NavBar composition
- Header — at the top of the page (auto-hide disabled for showcase clarity)
- Progress — default (animated), static (no animation), dashboard layout (hideStatus)
- BarTrackTicks — isolated, inside a fixed-size container
- Color tokens — semantic-layer swatches for visual sanity-checking palette consistency

When new primitives land in `@armada/ui`, add a section here. The showcase is the verification surface; if a primitive isn't shown here, we haven't earned the right to claim it's correctly ported.

## Layout chrome vs primitive rendering

The page layout (sections, headings, swatches, background gradient) is styled by `src/showcase.module.css`. The primitives themselves use **their own** CSS Modules from `@armada/ui` — the showcase never overrides primitive styling.

If you find yourself reaching for a wrapper class to tweak how a primitive looks, push the change upstream into the primitive's CSS Module instead. The showcase is for verifying, not for restyling.

## Why not Storybook?

Considered and rejected for now. Storybook adds significant tooling weight (config, MDX, addons, build) for a primitive set this small. A single page with sections is faster to load, faster to scan, and trivially diff-able against the mockup. We can adopt Storybook later if the design system grows past ~20 primitives or if non-developers need to browse it.

## Why not just run the mockup itself?

The mockup is read-only reference. We need a surface that consumes **our** package, not the mockup's source. The showcase proves the `@armada/ui` exports actually work in a real consumer.
