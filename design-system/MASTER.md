# GlobalMentor360 design system

Binding source of truth for every later page worker. If a page file exists under `design-system/pages/`, that file overrides this one for that route only. Otherwise use these rules exclusively.

**Stack (locked):** Next.js 16 App Router, React 19, Tailwind v4 (`@theme` in `app/globals.css`), shadcn (New York / Radix), lucide-react, Motion for React (`motion`). **No new UI libraries.**

**Mode:** Light-first. Dark tokens exist in CSS for a future pass; do not ship dark chrome on marketing or learner surfaces in this wave.

---

## 1. Chosen direction

| Dial | Choice |
|------|--------|
| Pattern | Hero + social proof + CTA (static, not a carousel) |
| Style | **Minimalism & Swiss Style** + **Accessible & Ethical** |
| Mood | Clean, confident, generous whitespace, strong type hierarchy. Adult academy — not a kids app, not neon SaaS, not glassmorphism, not AI purple/pink gradients. |
| Color | Deep teal-navy primary + warm amber CTA. Education teal from the skill, darkened until white text is ≥ 4.5:1. |
| Type | **Fraunces** (headings) + **Source Sans 3** (body) + **Noto Sans Bengali** (fallback for bKash copy) via `next/font/google`. |
| Radius | One personality: **8px** (`--radius: 0.5rem`). Soft enough to feel human, sharp enough to feel institutional. |
| Motion | Transform-only 8px rise (opacity stays 1), 150–250ms, stagger 40–80ms capped at ~6 children. See §9. |

---

## 2. Generator vs overrides

The UI UX Pro Max `--design-system` run for “online education course academy e-learning platform” recommended:

| Topic | Generator said | We use | Why |
|-------|----------------|--------|-----|
| Style | Claymorphism (chunky, toy-like, 16–24px, double shadows) | Minimalism & Swiss + Accessible & Ethical | Claymorphism is for children’s apps. This is a paid Bangladeshi academy (bKash, certificates). Owner asked for professional, not playful. Style search for “education platform trustworthy modern” returned **no verified match**; retry landed on `minimalism-and-swiss-style` and `accessible-and-ethical` (the latter lists education as a best-fit). |
| Pattern | Hero + testimonials **carousel** | Same sections, **static 3-up grid** | Carousels need pause/prev/next, stop on reduced motion, and keyboard access to every slide. A static grid meets the conversion pattern without the a11y cost. |
| Color | LMS / Online Course palette: `#0D9488` primary, `#2DD4BF` secondary, `#EA580C` / `#D97706` accent, mint `#F0FDFA` canvas, `#5EEAD4` borders, **black** on-primary | Deep teal `#0E4F56` + amber `#C2410C`, near-white canvas, neutral borders, **white** on-primary | Skill primary `#0D9488` on white is **3.74:1** (fails AA for text/UI). Accent `#EA580C` with white is **3.56:1**. We kept the education teal + achievement-orange *idea* and darkened both until white text passes. Mint borders read as spa, not academy. |
| Type | Baloo 2 + Comic Neue (“kids, education, playful”) | Fraunces + Source Sans 3 | Pairing #1 is for children’s games. Pairing #2 **Corporate Trust** (Lexend + Source Sans 3) is the professional education match; we kept Source Sans 3 and swapped Lexend for Fraunces so headings are distinctive without looking like a government PDF. |
| Effects | Inner+outer clay shadows, fluffy press | 2–3 subtle shadow tiers, no press-squash | Matches Swiss + ethical, not clay. |
| Anti-patterns to keep | Avoid boring / no gamification | Avoid **AI purple/pink**, glassmorphism, neon SaaS, emoji-as-icon, color-only status | Product constraints override the “add gamification” note. |
| Landing extras | Auto-rotating testimonials | None | Reduced-motion and LCP. |
| Density | Default 16–64 | Marketing: spacious (section `py-16`–`py-24`). Data lists (admin/studio): compact rows, same tokens. | |

Domain follow-ups used:

- Style retry: `minimalism-and-swiss-style`, `accessible-and-ethical`
- Typography: Corporate Trust (Lexend / Source Sans 3) — body kept, heading overridden
- Color: LMS + Online Course/E-learning rows (`#0D9488` / `#EA580C`) as the **hue source**, not the literal hex
- UX: empty states (message + action), active nav, deep linking via `?page=`
- Stacks: html-tailwind responsive padding (`px-4 sm:px-6 lg:px-8`); Next.js fonts on the root layout; reserve space / skeletons to avoid CLS; React forms use `onSubmit` + TypeScript; field errors stay associated (`FieldError` + `id`)

---

## 3. Palette

All text/UI contrast against its background is **≥ 4.5:1** (normal text) unless noted as large text / non-text.

### Light (shipping)

| Token | Hex | Contrast vs white | Usage |
|-------|-----|-------------------|--------|
| `--background` | `#F7FAFA` | — | Page canvas |
| `--foreground` | `#12262A` | 15.4:1 | Body text, headings |
| `--card` | `#FFFFFF` | — | Cards, popovers, dialogs |
| `--card-foreground` | `#12262A` | 16.6:1 on card | Card text |
| `--popover` / `--popover-foreground` | `#FFFFFF` / `#12262A` | same | Menus |
| `--primary` | `#0E4F56` | **9.25:1** (white on primary) | Links, default buttons, brand mark, focus ring |
| `--primary-foreground` | `#FFFFFF` | 9.25:1 | Text/icons on primary |
| `--primary-hover` | `#0A3D43` | 11.4:1 | Primary hover |
| `--primary-active` | `#072E33` | — | Primary pressed |
| `--secondary` | `#EEF3F4` | — | Secondary fills |
| `--secondary-foreground` | `#12262A` | — | Text on secondary |
| `--muted` | `#EEF3F4` | — | Zebra rows, icon wells, empty-state wash |
| `--muted-foreground` | `#3D5560` | **7.4:1** on `#F7FAFA` | Captions, placeholders, meta |
| `--accent` | `#C2410C` | **5.18:1** (white on accent) | High-emphasis CTAs, Free badge, price emphasis |
| `--accent-foreground` | `#FFFFFF` | 5.18:1 | Text on accent |
| `--accent-hover` | `#9A3412` | 7.31:1 | CTA hover |
| `--accent-active` | `#7C2D12` | — | CTA pressed |
| `--destructive` | `#B91C1C` | **6.5:1** white on it; **6.5:1** as text on white | Errors, failed/refunded |
| `--destructive-foreground` | `#FFFFFF` | — | Text on destructive |
| `--border` | `#D5E0E2` | — | Hairline borders (not mint) |
| `--input` | `#D5E0E2` | — | Input border at rest |
| `--ring` | `#0E4F56` | — | `:focus-visible` ring |
| `--success` | `#047857` | **5.6:1** white on it | Paid / published (always with a text label) |
| `--success-foreground` | `#FFFFFF` | — | |
| `--warning` | `#B45309` | **5.02:1** on white | Pending (text + optional icon, never color alone) |
| `--warning-foreground` | `#FFFFFF` | — | On solid warning chips |
| `--star` | `#B45309` | **5.02:1** | Rating glyphs and numeric average (not `amber-600`) |
| `--surface-alt` | `#F1F5F5` | — | Alternating bands, footer |

### Brand aliases (deprecated)

This restyle wave retired leftover kit on auth, catalog, landing, and chrome. Do **not** keep blessing `bg-brand` / `text-brand` / `brand-pink*` on new work. Tokens remain in `globals.css` only so a missed class does not flash unstyled.

| Alias | Maps to | Status |
|-------|---------|--------|
| `--brand` | `--primary` | Deprecated — use `primary` |
| `--brand-dark` | `--primary-hover` | Deprecated |
| `--brand-ink` | `#0B1C1F` | Still used on the player stage |
| `--brand-pink` | `--accent` | Deprecated (no longer pink) |
| `--brand-pink-soft` | `#EA580C` | Deprecated; decorative only, not small text |
| `--brand-pink-faint` | `#FFEDD5` | Deprecated |

`bg-hero-gradient` stays a **dark teal** gradient for any leftover white-on-teal band. The **home hero is light** and must not use that utility. `shadow-brand` is still the course-card hover shadow.

**Ban:** `hover:bg-accent` / `focus:bg-accent` as a muted highlight. `--accent` is CTA orange; a wash reads as a third button. Ghost/outline hover and menu focus use `muted` (or `primary/10`), never accent.

### Dark (tokens only, unused in this wave)

| Token | Hex |
|-------|-----|
| `--background` | `#0B1C1F` |
| `--foreground` | `#E8F1F2` |
| `--card` | `#12262A` |
| `--primary` | `#4BA3A0` |
| `--primary-foreground` | `#062428` |
| `--accent` | `#FB923C` |
| `--accent-foreground` | `#431407` |
| `--muted` | `#1A3034` |
| `--muted-foreground` | `#9BB0B4` |
| `--border` / `--input` | `#2A4246` |
| `--destructive` | `#F87171` |

---

## 4. Typography

Loaded in `app/layout.tsx` with `next/font/google` (self-hosted, **no CDN `<link>`**).

| Role | Family | Variable | Notes |
|------|--------|----------|--------|
| Display / headings | Fraunces (wght 500–700, `opsz` default) | `--font-heading` | Editorial, adult, distinctive |
| Body / UI | Source Sans 3 (400–700) | `--font-sans` | Highly readable, tabular-friendly |
| Bengali fallback | Noto Sans Bengali (400–700), `subsets: ["bengali"]`, `preload: false` | `--font-noto-bengali` | Cheap subset. Stack: Source Sans 3 → Noto Sans Bengali → system-ui |

**Stack:**

```css
--font-sans: var(--font-source-sans), var(--font-noto-bengali), ui-sans-serif, system-ui, sans-serif;
--font-heading: var(--font-fraunces), var(--font-source-sans), var(--font-noto-bengali), ui-serif, Georgia, serif;
```

Apply `font-heading` to `h1–h4` in `@layer base`. Body uses `font-sans`. **Do not** load fonts per page.

### Scale (mobile → 768+)

| Style | Size | Weight | Line-height | Letter-spacing | Class hints |
|-------|------|--------|-------------|----------------|-------------|
| Display / h1 | 32px / 48px (`text-3xl` / `sm:text-5xl`) | 600 | 1.15 | `-0.02em` | `font-heading tracking-tight` |
| h2 | 24px / 32px (`text-2xl` / `sm:text-3xl`) | 600 | 1.2 | `-0.02em` | |
| h3 | 20px (`text-xl`) | 600 | 1.3 | `-0.01em` | |
| h4 / card title | 16–18px | 600 | 1.35 | 0 | line-clamp-2 + `title` |
| Body | 16px (`text-base`) | 400 | 1.6 | 0 | never below 16px on marketing |
| Small / meta | 14px (`text-sm`) | 400 | 1.5 | 0 | `text-muted-foreground` |
| Caption / badge | 12px (`text-xs`) | 500 | 1.4 | `0.01em` | |
| Price | 18–20px | 700 | 1.2 | 0 | `tabular-nums` |

Body copy max-width on marketing: `~40rem` (`max-w-2xl`). Headlines `max-w-3xl`.

---

## 5. Spacing, radius, shadow

**Spacing rhythm:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96. Prefer Tailwind scale (`gap-4`, `p-6`, `py-20`).

| Context | Rule |
|---------|------|
| Page gutter | `px-4 sm:px-6 lg:px-8` |
| Content width | `max-w-6xl mx-auto` (marketing, catalog). Forms `max-w-md`. Data lists `max-w-6xl`. Player can go full. |
| Section padding | `py-16 sm:py-20 lg:py-24` |
| Card padding | `p-5 sm:p-6` |
| Form field stack | `gap-1.5` label→input, `gap-4` between fields |
| Header | sticky, `min-h-14 sm:min-h-16`, `scroll-padding-top: 5rem` on `html` |

**Radius (one personality):**

| Token | Value | Use |
|-------|-------|-----|
| `--radius` | `0.5rem` (8px) | Buttons, inputs, cards, alerts, tabs |
| `--radius-sm` | `0.375rem` | Tiny chips inside dense tables |
| `--radius-lg` | `0.5rem` | Same as base — do not balloon to 16–24px |
| `--radius-xl` | `0.75rem` | Optional cover wells |
| `--radius-2xl` | — | **Removed.** Do not reintroduce 16px cards. |
| Pills | `999px` | Badges, filter chips, pagination current page **only** |

**Shadows (three tiers, no clay double-shadow):**

| Token | Value | Use |
|-------|-------|-----|
| `--shadow-xs` | `0 1px 2px rgb(18 38 42 / 0.05)` | Inputs |
| `--shadow-sm` | `0 1px 2px rgb(18 38 42 / 0.06), 0 1px 1px rgb(18 38 42 / 0.04)` | Cards at rest |
| `--shadow-md` | `0 8px 24px rgb(18 38 42 / 0.08)` | Hover card, popover |
| `--shadow-brand` | `0 10px 28px rgb(14 79 86 / 0.16)` | Compat alias for primary CTAs / course-card hover |

No drop shadows on the header (use border + blur). No glassmorphism (`backdrop-blur` on the sticky header is a 8px frost, not a frosted-glass hero).

---

## 6. Component specs

### Button (`components/ui/button.tsx`)

`cursor-pointer` on all enabled buttons. `transition-colors duration-150`. No scale-bounce.

| Variant | Look | When |
|---------|------|------|
| `default` | Primary fill, white text, hover `--primary-hover` | Default actions |
| `cta` | Accent fill, white text, hover `--accent-hover` | **High-emphasis** (Enrol, Get started, Explore courses, Pay) |
| `outline` | Border, transparent/white fill | Secondary |
| `secondary` | Muted fill | Tertiary |
| `ghost` | No fill until hover | Header icon buttons |
| `link` | Primary text, underline on hover | Inline |
| `destructive` | Destructive fill | Irreversible |

| Size | Height | Notes |
|------|--------|--------|
| `sm` | 36px (`h-9`) | Dense tables only |
| `default` | 40px (`h-10`) | Forms |
| `lg` | 44px (`h-11`) | Marketing CTAs, header — **min 44px touch** |
| `icon` | 44px (`size-11`) in chrome, `size-9` in dense UI | |

Disabled: `opacity-50 pointer-events-none`. Focus: `focus-visible:ring-[3px] focus-visible:ring-ring/50` + ring offset against the surface.

### Card

White, `border-border`, `rounded-lg`, `shadow-sm`. Hover on interactive cards: `shadow-md` (or `shadow-brand`). No extra 2xl rounding unless MASTER is updated.

### Badge

Pill. Variants: `default` (primary), `secondary`, `outline`, `destructive`, `success`, `warning`. **Never color-only** — the label is the meaning (`Paid`, `Pending`, `Draft`). Truncate with `title` if a category name is long.

### Input / textarea / select / label / field error

- Label: `text-sm font-medium`, `cursor-pointer`, associated with `htmlFor`.
- Control: `h-10` (textarea `min-h-16`), `rounded-md`, `border-input`, `shadow-xs`, placeholder `text-muted-foreground`.
- Focus: ring as buttons.
- Invalid: `aria-invalid` + destructive border/ring.
- Error: `FieldError` with `role="alert"` and `id` referenced by `aria-describedby`. Do not show errors only in a toast.

### Alert

`rounded-lg border`. `default` = card surface. `destructive` = destructive text + icon (lucide, not emoji). Flash messages use `FlashAlert`.

### Tabs

Muted track, active tab white + `shadow-sm`. `cursor-pointer`. Line variant allowed for studio. Focus ring on trigger.

### Separator

`bg-border`, 1px. Decorative `decorative`.

### Skeleton

`bg-muted animate-pulse rounded-md`. **`motion-reduce:animate-none`**. Reserve the same height as the eventual content (CLS).

### Nav header

Sticky `z-50`, `bg-background/95`, 1px `border-b`, light blur. Skip link first. Logo (mark + wordmark). Primary links: Courses; Studio/Admin if role. Right cluster: cart (badge count), notifications bell, account, **My learning** / **Get started**. Active route: `text-foreground font-semibold` **and** `aria-current="page"` (not color-only). Icon buttons `size-11`. Cart/bell badges: accessible name includes the count (`Cart, 3 items`; singular `1 item`).

### Footer

Four-column on `lg`, stacked on mobile. (1) Brand mark + one-sentence blurb + © year. (2) Learn: Courses, My learning, Cart. (3) Account: Sign in, Create account, Account. (4) For organisations: certificates / that payments are bKash in BDT. No fake social networks. Link hover `text-foreground`, `underline-offset-4`.

### Pagination (`PageNav`)

Same props/query contract: `pathname`, `params`, `page`, `pageCount`; optional `pageParam` (default `page`) so reviews (`reviewPage`) and player Q&A (`qaPage`) do not collide with catalog `?page=`. Links via `pageHref` (`?page=` / the custom key omitted on page 1, other params preserved).

- `pageCount <= 1`: render **nothing**.
- `pageCount <= 7`: Prev + every page number + Next.
- Else: **Prev, first, ellipsis, current±1, ellipsis, last, Next**.
- Current: filled primary, `aria-current="page"`.
- Targets ≥ 44px. Include visually-hidden **`page {n} of {count}`** (keeps verify-pages and SRs honest).
- Ellipsis `aria-hidden`. Prev/Next disabled (not omitted) on ends so the control cluster does not jump.

### Empty state

Centered, dashed border, muted wash, **icon in a 56px soft primary circle**, heading, body. **Search-miss / filter-miss:** heading + body (mention the query when `q` is set) + **exactly one primary CTA** to clear. **True-empty staff queues** (no users yet, empty studio inbox, no courses in admin): heading + body, **no CTA** — do not reuse the search-miss sentence. Learner lists (catalog with zero published courses, dashboard, cart) may omit the CTA when there is nothing to clear and no useful create action. Never a blank dashed box.

### Status badges

Map status → `{ variant, label }`. Labels are sentence case (`Paid`, `In review`), not raw enums. Pair with an icon when space allows. Color is reinforcement only.

### Table / list rows (admin, studio, orders)

- Header: `text-sm font-medium text-muted-foreground`.
- Row: `h-12`, `border-b`, hover `bg-muted/50`.
- Money and dates: `tabular-nums`.
- Long titles: `truncate` + `title={full}`.
- 1000+ rows: **always paginate** with `PageNav`. No infinite scroll on data lists.
- Zebra optional; borders required.

### Course card (money component)

- Cover `h-44`: hashed on-palette teal/navy gradient (`COVER_TONES` in `course-card.tsx`) + oversized initials watermark (not a broken image). Tones are primary / brand-ink / foreground only — **no `to-success` green**.
- Badges on cover: level, category, Free (accent).
- Title: `line-clamp-2 font-heading`, `title` attr.
- Instructor meta `text-sm text-muted-foreground`.
- Rating row: `CompactRating` using `--star`, lecture count, duration.
- Price row: `tabular-nums` accent/primary, “Not for sale” if no price and not free.
- Whole card is one link. Hover: `shadow-brand`, title color primary.

### Star rating / histogram / review list

Stars use `--star`, not `text-amber-600`. Histogram bars the same. Reviews: author + stars + date; empty copy is a sentence, not a void. Initials avatar in a muted circle (no random photos).

---

## 7. Interaction states

| State | Rule |
|-------|------|
| Hover | 150ms color/shadow. `cursor-pointer` on every clickable (buttons, links, summary, icon buttons). Ghost/outline and menu focus: `hover:bg-muted` / `focus:bg-muted`, **never** `hover:bg-accent` (accent is CTA orange). |
| Focus-visible | 3px ring `--ring` at 50% + 2px offset. Never `outline-none` without a replacement. Sticky header must not fully cover focused content (`scroll-padding-top`). |
| Active | Darken one step (`primary-active` / `accent-active`). No spring bounce. |
| Disabled | 50% opacity, no pointer, no hover. |
| Loading | Same-size control, `aria-busy`, disable submit. Skeleton for page regions. |

---

## 8. Responsive breakpoints

| Name | Width | Layout |
|------|-------|--------|
| Mobile | **375** | Single column, 44px targets, header wraps, course grid 1 col |
| Tablet | **768** | 2-col course grid, footer 2-col, stats in a row |
| Laptop | **1024** | 3-col course grid, 4-col footer, header single row |
| Desktop | **1440** | Same as 1024 inside `max-w-6xl` — do not stretch copy to the viewport edge |

Hide/show with `hidden md:flex` etc. **Do not** maintain two completely different DOM trees for mobile vs desktop (html-tailwind guideline).

---

## 9. Motion

Package: `motion` (Motion for React). **Sanctioned primitive:** `components/site/reveal.tsx` (`Reveal`, `RevealStagger`, `RevealItem`).

`MotionConfig reducedMotion="user"` lives in `components/site/motion-provider.tsx`, wrapped from the server `app/layout.tsx`. Do not make the root layout a client component.

| Token | Value |
|-------|--------|
| Fast | **150ms** (hover, color, focus) |
| Base | **200–250ms** (entrances, panels) |
| Slow cap | **400ms** — never longer on product UI |
| Entrance easing | `ease-out` (cubic `[0.16, 1, 0.3, 1]`) |
| Movement easing | `ease-in-out` |
| Reveal | **8px rise**, opacity stays **1**, `whileInView` **once**, viewport margin `0px 0px -8% 0px` |
| Stagger | **40–80ms** between children, **cap ~6 children**. More items → don’t stagger the whole list |

**Hard rules**

1. Animate **opacity and transform only**. Never `width`, `height`, `top`, `left`, margin, or anything that causes layout shift. Accordion height animation is the exception that **must** disable under `prefers-reduced-motion: reduce` (`animation: none` on `[data-slot="accordion-content"]`).
2. Every animation respects `prefers-reduced-motion` via MotionConfig (`reducedMotion="user"`) and/or `useReducedMotion`. Under reduced motion, snap to the **final state** (no partial fade).
3. **LCP / visibility:** never start content at `opacity: 0`. The Reveal primitive is transform-only (`y: 8 → 0`, opacity stays 1) so off-screen sections, print, and full-page captures cannot render as blank holes. Hero headings may also pass `lcpSafe` to skip the initial offset entirely.
4. Rapid interruption (hover out, route change, reduced-motion toggle) must land on the correct final state — no stuck `opacity: 0`.
5. **No ad-hoc `motion.div` in pages.** Page workers import `Reveal` / `RevealStagger` / `RevealItem`. Exceptions: genuinely bespoke interactions (player chrome, quiz answer feedback).
6. No bounce springs, no parallax, no looping decorative motion, no auto-rotating carousels.

---

## 10. Accessibility checklist

From the skill pre-delivery list + Accessible & Ethical + UX rows:

- [ ] **No emoji as icons.** Lucide (or another SVG) only. Decorative icons `aria-hidden`.
- [ ] **`cursor-pointer` on every clickable.**
- [ ] Hover 150–300ms; no instant unexplained snaps on marketing.
- [ ] Light-mode text **≥ 4.5:1** (measure new colors; do not assume Tailwind `*-500` passes).
- [ ] Visible `:focus-visible` on keyboard nav (3px ring).
- [ ] `prefers-reduced-motion` respected (MotionConfig + CSS `motion-reduce:`).
- [ ] Responsive at 375 / 768 / 1024 / 1440; text reflows, **no clipping**.
- [ ] Badge/status **meaning is not color alone**.
- [ ] Touch targets **≥ 44×44px** on chrome, pagination, and marketing CTAs.
- [ ] Skip link to `#main`.
- [ ] Live counts: accessible name is “3 items in cart”, not a bare “3”.
- [ ] Forms: `onSubmit` on the form; errors linked to fields; existing `FieldError` pattern.
- [ ] Pagination: `aria-current="page"`, `aria-label="Pages"`.
- [ ] Images/covers: empty alt when decorative; course title is the name of the link.

---

## 11. Per-page-type patterns

### Marketing (home) — reference implementation: `app/page.tsx`

Light hero (not `bg-hero-gradient`): eyebrow, heading, subhead, **primary CTA → `/courses`**, optional secondary. Stats strip (real counts only; if zero courses, qualitative stats — never “0+”). Featured `CourseCard` grid **or** omit the section and keep how-it-works + CTA so the page still feels finished. How-it-works: **3 steps**, lucide in soft circles. Testimonials: up to 3 static cards **if** visible reviews with bodies exist; otherwise omit. Closing CTA band on primary. Server page; Reveal islands only.

### Catalog grid (`/courses`)

Live filter UI is **compact native `<select>`s + removable chips** (not filled pills). Grid `1 / 2 / 3` cols. Results wrapped in a region with an `h2` “Results” (visually hidden is fine). Empty: distinguish **no published courses at all** vs **no match**; search-miss EmptyState must include heading, body that mentions `q` when set, and Clear filters. Paginate at **24**. “Showing X–Y of N” stays.

### Detail / landing (`/courses/[slug]`)

**Restyled in this wave.** Light header (not a dark `bg-hero-gradient` band) + sticky enrol card on desktop. Rating histogram + reviews; reviews paginate with `?reviewPage=` (must not collide with catalog `?page=`), page size 20, “Showing X–Y of N”. Locked curriculum items stay non-links and include visible **Locked** text (same pattern as the player sidebar). White text on any leftover `bg-hero-gradient` must remain ≥ 4.5:1.

### Learner dashboard

Cards for in-progress / completed. Empty enrolled list: EmptyState + Browse courses. Progress with text percentage, not color-only bars.

### Data list (admin / studio)

Toolbar (search + primary action) → table/list → `PageNav`. Search-miss: heading + “No X match” + Clear. True empty with no filter: different copy; no CTA on users or studio inbox. Dense but 16px minimum body. Tabular numbers for money.

### Player

Dark ink stage (`--brand-ink`) is OK — it is a viewing surface, not a marketing hero. Controls ≥ 44px. Do not fade-in the video (LCP/CLS). Bespoke motion allowed for quiz feedback only.

---

## 12. Zero-data and high-volume

| Situation | Rule |
|-----------|------|
| Zero items | Styled `EmptyState` (icon circle + heading + body; CTA only when there is a useful action). Home omits featured/testimonials rather than rendering a sad blank grid **and** still shows hero, how-it-works, and CTA. Staff true-empty queues: no CTA. |
| Zero reviews | Omit testimonial section; on a course page, histogram stays at 0% with honest copy. |
| 1000+ rows | `PageNav`, `truncate` + `title`, `tabular-nums` for money, no client-side render of the full set. Reviews use `?reviewPage=`; player Q&A uses `?qaPage=`. |
| Search with no hits | EmptyState with heading + body explaining the query + a control to clear filters. Do not reuse true-empty copy. |

---

## 13. Implementation map

| Concern | File |
|---------|------|
| Tokens | `app/globals.css` |
| Fonts | `app/layout.tsx` |
| Reduced motion root | `components/site/motion-provider.tsx` |
| Motion primitive | `components/site/reveal.tsx` |
| UI kit | `components/ui/*` |
| Site chrome / cards / pager | `components/site/*` |
| This document | `design-system/MASTER.md` |

Page workers: read this file first. Do not introduce new hex values, font families, or animation libraries.
