---
name: GatherHub
description: Operating system for community sports clubs and volunteer-run organisations.
colors:
  paper: "oklch(99% 0.003 250)"
  surface: "oklch(98% 0.004 250)"
  surface-sunk: "oklch(96.5% 0.006 250)"
  surface-raised: "oklch(99.5% 0.002 250)"
  border-hairline: "oklch(93% 0.008 250)"
  border: "oklch(88% 0.010 250)"
  border-strong: "oklch(80% 0.012 250)"
  ink-quiet: "oklch(48% 0.014 250)"
  ink-soft: "oklch(36% 0.018 250)"
  ink: "oklch(22% 0.020 250)"
  ink-strong: "oklch(14% 0.020 250)"
  accent: "oklch(38% 0.080 250)"
  accent-hover: "oklch(32% 0.085 250)"
  accent-active: "oklch(28% 0.085 250)"
  accent-wash: "oklch(94% 0.025 250)"
  accent-ink: "oklch(98% 0.003 250)"
  success: "oklch(48% 0.100 155)"
  success-wash: "oklch(94% 0.040 155)"
  warning: "oklch(60% 0.130 70)"
  warning-wash: "oklch(94% 0.060 75)"
  danger: "oklch(48% 0.160 25)"
  danger-wash: "oklch(94% 0.050 25)"
  info: "oklch(45% 0.070 235)"
  info-wash: "oklch(94% 0.030 235)"
  paper-dark: "oklch(15% 0.010 250)"
  surface-dark: "oklch(18% 0.012 250)"
  surface-sunk-dark: "oklch(12.5% 0.010 250)"
  surface-raised-dark: "oklch(21% 0.014 250)"
  border-hairline-dark: "oklch(22% 0.014 250)"
  border-dark: "oklch(28% 0.016 250)"
  border-strong-dark: "oklch(36% 0.018 250)"
  ink-quiet-dark: "oklch(58% 0.014 250)"
  ink-soft-dark: "oklch(72% 0.016 250)"
  ink-dark: "oklch(88% 0.012 250)"
  ink-strong-dark: "oklch(96% 0.008 250)"
  accent-dark: "oklch(72% 0.090 250)"
  accent-hover-dark: "oklch(78% 0.095 250)"
  accent-active-dark: "oklch(82% 0.095 250)"
  accent-wash-dark: "oklch(28% 0.045 250)"
  accent-ink-dark: "oklch(14% 0.020 250)"
  success-dark: "oklch(68% 0.100 155)"
  warning-dark: "oklch(76% 0.130 70)"
  danger-dark: "oklch(68% 0.140 25)"
  info-dark: "oklch(70% 0.080 235)"
typography:
  display:
    fontFamily: "InterVariable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: "2.125rem"
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "InterVariable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.012em"
  title:
    fontFamily: "InterVariable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "-0.008em"
  body:
    fontFamily: "InterVariable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.375rem"
    letterSpacing: "-0.003em"
  body-strong:
    fontFamily: "InterVariable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 550
    lineHeight: "1.375rem"
    letterSpacing: "-0.003em"
  caption:
    fontFamily: "InterVariable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.125rem"
    letterSpacing: "0"
  label:
    fontFamily: "InterVariable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.04em"
  numeric:
    fontFamily: "InterVariable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.375rem"
    letterSpacing: "-0.005em"
    fontFeature: "'tnum' 1, 'cv11' 1"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 450
    lineHeight: "1.25rem"
    letterSpacing: "0"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "9999px"
spacing:
  px: "1px"
  half: "2px"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "32px"
  "8": "40px"
  "9": "48px"
  "10": "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-ink}"
  button-primary-active:
    backgroundColor: "{colors.accent-active}"
    textColor: "{colors.accent-ink}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunk}"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
    height: "34px"
  input-focus:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-strong}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "20px 24px"
  sidebar:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body}"
    width: "240px"
  topbar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    height: "52px"
    padding: "0 20px"
  chip:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    height: "22px"
  chip-accent:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent}"
  chip-success:
    backgroundColor: "{colors.success-wash}"
    textColor: "{colors.success}"
  chip-warning:
    backgroundColor: "{colors.warning-wash}"
    textColor: "{colors.warning}"
  chip-danger:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger}"
  table-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "44px"
    padding: "0 16px"
  table-row-hover:
    backgroundColor: "{colors.surface-sunk}"
  table-header:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-quiet}"
    typography: "{typography.label}"
    height: "36px"
    padding: "0 16px"
  dialog:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
    width: "480px"
  drawer:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    width: "420px"
    padding: "24px"
  command-palette:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    width: "640px"
    padding: "8px"
  status-dot:
    backgroundColor: "{colors.ink-quiet}"
    rounded: "{rounded.pill}"
    size: "6px"
---

# Design System: GatherHub

## 1. Overview

**Creative North Star: "The Quiet Operator"**

GatherHub is a tool a tired volunteer treasurer opens at 9pm to answer a
specific question and to log an honest action. The interface should
disappear into the task. The Quiet Operator is the system disposition:
the product never raises its voice, never celebrates routine work,
never makes itself the centre of attention. Density is high but the
weight is low. Decisions are made by typography, hairline borders, and
disciplined whitespace, not by colour, shadow, or motion.

The palette is tinted-neutral paper with a single cool slate-blue ink
accent, used sparingly. The type is a single well-tuned sans family
(Inter Variable) carrying every role from label to display; numerics
are tabular by default because committee work is list work. Surfaces
are flat at rest; depth is conveyed by tonal layering, not shadows.
Shadows appear only when something is genuinely lifted off the page
(popover, dropdown, dialog) and never as decoration.

What this system explicitly rejects, carried forward from
[`PRODUCT.md`](./PRODUCT.md): the SaaS-indigo-to-pink gradient register,
glassmorphism as decoration, hero metric tiles with sparklines, the
chat-thread-first IA of Spond and TeamSnap, the consumer-clubby
baby-blue and kid-green palettes, the crypto and AI-startup neon-on-black
register, the Bootstrap-density admin panel layered with breadcrumbs and
accordions. Each of these is a specific named anti-pattern; the Don'ts
in section 6 repeat them by name.

**Key Characteristics:**
- Restrained colour: tinted neutrals plus one cool accent, used on ≤10% of any screen.
- Single-family typography (Inter Variable) at a tight 1.18 scale; numerics tabular by default.
- Flat by default; tonal surface layering, not shadows, conveys structure.
- Hairline borders (1px, low-chroma) carry the visual grid.
- Light canonical, dark first-class; both checked at the token layer.
- 150–220ms ease-out-quart on state transitions; nothing else moves.

## 2. Colors: The Quiet Operator Palette

A tinted-neutral paper field with a single cool slate-blue ink accent.
The accent never carries decoration; it only marks the next action, the
selected item, or a primary status.

### Primary
- **Slate Ink** (`oklch(38% 0.080 250)`): The single accent. Used for primary buttons, active sidebar item, current selection in tables, focused field border, and unread/audit markers. Dark mode lifts to `oklch(72% 0.090 250)` for contrast on dark surfaces.

### Neutral
- **Paper** (`oklch(99% 0.003 250)`): Canonical page background in light mode. Tinted faintly toward the accent hue so it never feels clinical.
- **Surface** (`oklch(98% 0.004 250)`): Cards, panels, inputs, primary content blocks at rest.
- **Surface Sunk** (`oklch(96.5% 0.006 250)`): Sidebar, toolbars, table header on hover, recessed regions. One tonal step beneath Paper.
- **Surface Raised** (`oklch(99.5% 0.002 250)`): Dialogs, popovers, command palette, drawers. One tonal step above Paper. Pairs with the only shadows in the system.
- **Border Hairline** (`oklch(93% 0.008 250)`): Default table dividers, input borders at rest, separator lines. Always 1px.
- **Border** (`oklch(88% 0.010 250)`): Card and panel borders, button outlines.
- **Border Strong** (`oklch(80% 0.012 250)`): Focused input border, drag handles.
- **Ink Strong** (`oklch(14% 0.020 250)`): Headlines and emphasized labels only.
- **Ink** (`oklch(22% 0.020 250)`): Body text. Default reading colour.
- **Ink Soft** (`oklch(36% 0.018 250)`): Secondary text, table cells one level down, ghost buttons.
- **Ink Quiet** (`oklch(48% 0.014 250)`): Metadata, timestamps, table headers, placeholder, helper text.

### Status (semantic only, never decorative)
- **Success** (`oklch(48% 0.100 155)`): Confirmed payment, kit returned on time, attendance recorded. Paired with `success-wash` for inline chip backgrounds.
- **Warning** (`oklch(60% 0.130 70)`): Certification expiring, kit overdue, subs due soon. Amber-ochre, not yellow.
- **Danger** (`oklch(48% 0.160 25)`): Permission denied, write conflict, safeguarding flag, kit lost. Brick red, not rose.
- **Info** (`oklch(45% 0.070 235)`): Neutral notices, audit-trail markers, system messages. Reserved; rarely appears.

### Named Rules

**The 10% Accent Rule.** Slate Ink covers no more than 10% of any rendered screen. Count it. If a primary button, the active sidebar item, and a selected row already exist on screen, a fourth use of the accent is wrong.

**The No Saturation in Chrome Rule.** Chrome (sidebar, top bar, table dividers, borders, cards) is tinted-neutral only. Saturation lives in content (status chips, accent buttons, audit markers). If a sidebar starts to look coloured, the chrome is wrong, not the accent.

**The Status Carries Icon + Text Rule.** Status colour is never the only signal. Every status chip has an icon and a text label; every status row has a textual state. Colour-blind users and screen readers get the same information.

## 3. Typography

**Display Font:** Inter Variable (system-ui, sans-serif fallback)
**Body Font:** Inter Variable (same family; weight contrast carries hierarchy)
**Numeric Font:** Inter Variable with `font-feature-settings: 'tnum' 1, 'cv11' 1` (tabular numerals, single-storey a alternate)
**Mono Font:** JetBrains Mono (ui-monospace fallback) for kit serials, QR data, audit IDs, code blocks

**Character:** One family carries every role. Hierarchy comes from
weight contrast (400 → 550 → 600) and tight scale steps, not from
multiple typefaces. The single-family discipline is the visual
embodiment of "Quiet Operator": no display flourish, no editorial
serif, no surprise.

### Hierarchy
- **Display** (600, 1.75rem / 28px, 2.125rem line, -0.015em tracking): Section landings (Members, KitTrace, Settings page titles). Never inline.
- **Headline** (600, 1.375rem / 22px, 1.75rem line): Subsection titles, dialog titles, drawer titles.
- **Title** (600, 1.0625rem / 17px, 1.5rem line): Card and panel titles, table titles inside a panel.
- **Body** (400, 0.875rem / 14px, 1.375rem line): Default product UI body. Tables, forms, list items. Prose blocks capped at 70ch.
- **Body Strong** (550, 14px, 1.375rem line): Inline emphasis, button labels, table primary-column values.
- **Caption** (400, 0.75rem / 12px, 1.125rem line): Metadata, timestamps under primary text, chip labels.
- **Label** (600, 0.6875rem / 11px, 0.04em tracking, uppercase): Form labels, table headers, sidebar section dividers. Sparing use; never on body content.
- **Numeric** (500 tabular, 14px): Default for any column or field that holds a number (counts, money, percentages, attendance figures). Always tabular.

### Named Rules

**The One Family Rule.** Inter Variable carries every role. The system has no display serif, no script accent, no second sans. If a second family is reached for, the answer is wrong weight, not wrong typeface.

**The Tabular Numerics Rule.** Any digit that appears in a column, total, badge count, money figure, or attendance count uses tabular numerals. Lining proportional digits are forbidden in committee data.

**The Label Restraint Rule.** The uppercase Label role appears only in form field labels, table headers, and sidebar section dividers. It is forbidden in body copy, button text, dialog headings, and decorative captions. Uppercase is a structural marker, not a tone.

## 4. Elevation

The system is **flat by default**. Depth is conveyed by tonal surface
layering (Sunk → Paper → Surface → Raised), not by shadows. Sidebar
sits one step beneath Paper; cards sit at Surface, indistinguishable
from Paper unless bordered; dialogs sit one step above. The result is
a quiet, paper-like field where structure reads through tonal value,
not through depth.

Shadows are reserved for genuinely-lifted overlay surfaces only.
Outside those three uses, the system has no shadows.

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 1px 2px oklch(0% 0 0 / 0.04), 0 6px 16px oklch(0% 0 0 / 0.06)`): Dropdown menus, tooltips, command palette, autocomplete. The default overlay shadow.
- **Dialog** (`box-shadow: 0 2px 4px oklch(0% 0 0 / 0.05), 0 16px 32px oklch(0% 0 0 / 0.10)`): Modal dialogs, confirmation prompts, full-screen drawers on desktop.
- **Focus Ring** (`box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px oklch(38% 0.08 250 / 0.45)`): The only "lift" applied to interactive elements. Replaces browser default focus everywhere.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows exist only as a response to "this thing is actually floating off the page": popover, dialog, focused control. Hover does not lift; hover changes tonal value.

**The Tonal-Before-Shadow Rule.** When a region needs to read as distinct, the answer is a tonal step (Surface → Surface Sunk, or a hairline border), not a shadow. Sidebars, cards, toolbars, and table headers carry zero box-shadow.

## 5. Components

### Buttons
- **Shape:** Subtle rounded corners (6px). Pills are reserved for status chips; sharp corners are reserved for nothing.
- **Primary:** Slate Ink fill (`accent`), paper ink text (`accent-ink`), 36px tall, 14px horizontal padding. Hover steps to `accent-hover` (one tonal step darker). Active to `accent-active`. Used once per visible surface for the principal next action.
- **Secondary:** Surface fill, ink text, 1px Border. Hover to Surface Sunk. The default for non-principal actions. Most action rows are Secondary, not Primary.
- **Ghost:** Transparent at rest, Ink Soft text. Hover fills Surface Sunk and lifts text to Ink. Used in dense toolbars, command lists, and table row actions.
- **Danger:** Danger fill, paper ink text. Reserved for destructive confirmations (delete member, mark kit lost, revoke role). Never as a default styling for a "warning" action; the action must be genuinely destructive.
- **Focus:** All variants share the Focus Ring (`oklch(38% 0.08 250 / 0.45)` outer ring, 2px paper inner gap). Browser default focus is suppressed.

### Inputs and Fields
- **Style:** Surface fill, Border Hairline, 6px radius, 34px tall, 14px body text. Caret matches Ink Strong.
- **Focus:** Border lifts to `accent` colour at 1px, plus Focus Ring. No glow, no inner shadow. Fill stays Surface.
- **Error:** Border lifts to Danger; an inline Caption line in Danger sits 4px below the field. The field background does not tint; tinting hides the user's text.
- **Disabled:** Surface Sunk fill, Ink Quiet text. No border change. Cursor `not-allowed`.

### Cards and Panels
- **Corner Style:** 8px radius for cards, 8px for panels, 12px for dialogs and drawers.
- **Background:** Surface, on Paper. Cards are nearly indistinguishable from the page unless a Border Hairline is drawn around them.
- **Shadow Strategy:** None at rest. Hover, if interactive, lifts to Surface Raised tone, not shadow.
- **Border:** 1px Border Hairline. The border is the affordance; the shadow is not.
- **Internal Padding:** 16px for cards, 20×24px for panels. **No nested cards.** A card containing a card is always wrong; collapse to a list, a divided panel, or a section heading.

### Tables (signature surface)
- **Header:** Sticky on scroll, Paper background, Label typography in Ink Quiet, 36px tall, Border Hairline beneath. Sort affordance is a small caret next to the label.
- **Rows:** Paper background by default, 44px tall, 16px horizontal padding, Border Hairline between rows. Hover lifts to Surface Sunk. Selection lifts to `accent-wash` background with a 2px accent-coloured left edge **on the cell** (not the row); the row keeps a full border, never a stripe.
- **Numerics:** Right-aligned, tabular figures, Numeric token. Money values include the currency suffix as Ink Quiet caption.
- **Density toggle:** A single density control (Comfortable / Compact) at the table toolbar, changing row height from 44px to 36px. No third density.
- **Empty:** No illustration. A single sentence in Ink Soft explaining what would appear here, and one action (Secondary button) to make it appear.

### Sidebar
- **Width:** 240px expanded, 56px collapsed. Collapse is persisted per user.
- **Background:** Surface Sunk. Tonal recession, no border on the content side, 1px Border Hairline on the trailing edge.
- **Sections:** Label typography for dividers ("WORKSPACE", "OPERATIONS", "INSIGHTS"). Items are Body, 28px tall, 12px horizontal padding inside an 8px outer margin.
- **Active item:** Surface fill (lifts to Paper tone), Ink Strong text, no left stripe, no icon recolour beyond the text colour shift. The lift IS the affordance.
- **Hover:** Surface fill at half tonal step, Ink text.
- **Keyboard shortcut hints:** Caption typography in Ink Quiet on the right of each item; reveal on row hover.

### Top Bar
- **Style:** 52px tall, Paper background, 1px Border Hairline beneath.
- **Left:** Workspace switcher (club name + chevron); opens a popover.
- **Centre:** Global search trigger, opens the Command Palette on click or ⌘K. Displays the keyboard shortcut as a kbd chip.
- **Right:** Notifications bell (popover), user avatar (popover menu).

### Command Palette
- **Style:** 640px wide, centred ~120px from top, Surface Raised on a 30% Ink scrim. Dialog shadow.
- **Behaviour:** Opens on ⌘K / Ctrl-K. Single search field at top. Below: grouped results (Members, Teams, Events, KitTrace, Settings, Actions). Recent results pinned above search results.
- **Result row:** 40px tall, leading 16px icon, Body label, trailing Caption hint (route or shortcut). Selection follows arrow keys; selected row uses `accent-wash`.

### Chips
- **Shape:** Pill (`rounded.pill`), 22px tall, 8px horizontal padding, Caption typography.
- **Default:** Surface Sunk background, Ink Soft text. Used for tags, filters, role labels.
- **Status variants:** `chip-success`, `chip-warning`, `chip-danger`, `chip-accent`. Each uses the matching wash background and full status colour for the text. Every status chip includes a 6px leading status dot and a text label; colour is never the only signal.

### Audit Row (signature pattern)
GatherHub treats audit entries as first-class data, not log noise. Wherever a member, kit item, payment, or volunteer record is detailed, an Audit Row appears beneath it.
- **Layout:** Three columns, single line at desktop, stacked on mobile.
- **Timestamp:** Mono token, Ink Quiet, fixed 96px width.
- **Actor:** Avatar 18px, body-strong name, optional role chip.
- **Action:** Body text in active verb form ("issued U13 keeper jersey to Jordan M.", "marked subs paid for Aug 2026"). Mutations link to the affected record.
- **Hover:** Surface Sunk row tint. Click expands the row in place to show before/after values.

### Empty State
- **No illustration.** A single Body Strong line explaining what would appear here, one Body line of context, one Secondary button to populate it.
- Layout: vertically centred in the available region; max 360px wide. Reserved tone, no exclamation marks.

## 6. Do's and Don'ts

### Do:
- **Do** keep slate-blue accent at or below 10% of any rendered screen. Count the uses before shipping a layout.
- **Do** reach for tonal surface steps (Surface → Surface Sunk → Surface Raised) before reaching for a shadow. Shadows are reserved for genuinely-floating overlays.
- **Do** carry hierarchy with weight contrast in a single family (400 / 550 / 600); never introduce a second typeface for emphasis.
- **Do** render numbers with tabular figures and right-aligned columns in every table, money field, and count badge.
- **Do** pair every status colour with an icon and a text label; colour is never the sole carrier of meaning.
- **Do** treat empty states as teaching surfaces with one Secondary action, not "nothing here" placeholders.
- **Do** suppress browser default focus and apply the token Focus Ring on every interactive element, including custom controls.
- **Do** respect `prefers-reduced-motion`: non-essential transitions disable; essential ones shorten to opacity-only at 100ms.
- **Do** verify contrast at the token layer (Ink on Paper, Accent on Paper, Status on Wash) so theme changes cannot silently degrade WCAG 2.2 AA compliance.

### Don't:
- **Don't** use the SaaS-indigo-to-pink gradient register, gradient text (`background-clip: text` on a gradient), or any decorative gradient. The pasted brief that seeded this project leaned into this lane; reject it. Quoting [`PRODUCT.md`](./PRODUCT.md): *no purple-to-pink gradient accents, no hero metric tiles with sparkline + percent-up arrow as the home page, no identical icon-and-heading card grids, no glassmorphism as decoration, no gradient text.*
- **Don't** use glassmorphism (backdrop blur on translucent cards) as decoration. Backdrop blur is reserved for the command palette scrim and nothing else.
- **Don't** ship the hero-metric template (big number + small label + sparkline + percent-up arrow tile grid) as the dashboard home. Committee work is list work; the home is a workload-shaped list, not a vanity scoreboard.
- **Don't** ship identical icon-and-heading card grids. Differentiate by content, weight, and size; never by repeating the same card module four times.
- **Don't** use border-left or border-right greater than 1px as a coloured stripe on cards, list items, or alerts. Use a full hairline border, a tonal wash background, or a leading status dot instead.
- **Don't** mimic Spond, TeamSnap, or Heja: no chat-thread-first IA, no consumer-y baby-blue palette, no emoji reactions on operational records, no kid-app illustration. Committee work is not a group chat.
- **Don't** drift into crypto / AI-startup neon: no black-with-neon, no animated gradient backgrounds, no hero glow, no "intelligent" framing of basic CRUD.
- **Don't** stack enterprise-admin chrome layers: no breadcrumb + tabs + accordion on the same surface. Density comes from typography and whitespace, not from collapsing every section.
- **Don't** write marketing voice in product copy: no "Supercharge your club", no "Empower your committee", no exclamation marks. Quote [`PRODUCT.md`](./PRODUCT.md) on tone: plain, second-person, present tense.
- **Don't** introduce a second type family for display. Inter Variable carries every role. If a section feels under-emphasised, the fix is weight or size, not a serif accent.
- **Don't** nest cards. A card inside a card is always wrong; collapse to a divided panel, a list, or a heading.
- **Don't** use colour as the sole status signal. Every status chip carries an icon, a text label, and a dot.
- **Don't** decorate motion. Transitions exist to convey state (open, close, focus, select); they do not orchestrate page entrance, scroll-driven reveal, or hover choreography.
