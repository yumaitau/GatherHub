# Product

## Register

product

## Users

GatherHub is built for the **committee admin at a desk**: a volunteer
treasurer, secretary, or club manager working from a laptop on weekday
evenings. They handle real money, real safeguarding, and real member data,
usually for free, on top of a day job. They are not novice computer users,
but they are not power users of any one app either — they switch between
spreadsheets, email, and whichever banking portal they were given.

Secondary users sit around that core: **coaches** marking attendance from
a phone at training, **volunteers** scanning kit pitch-side via the iOS
app, and **players or parents** consuming public information (team pages,
the public club site, "return to owner" QR landing pages). Roles are
enforced server-side (Owner, Admin, Committee, Coach, Volunteer, Parent,
Player) and the UI must respect that hierarchy without making it noisy.

The job to be done: run the operational side of a community sports club
or volunteer-run organisation without losing track of people, kit, money,
or accountability. The user opens GatherHub to **answer a specific
question fast** (who has the U13 keeper jersey, who hasn't paid subs, who
is rostered Saturday) and to **log an action** so the audit trail stays
honest. Sessions are short, frequent, and often interrupted.

## Product Purpose

GatherHub is the operating system for community sports clubs and
volunteer-run organisations. It exists because the work of running a club
(membership, teams, attendance, kit, volunteers, sponsors, a basic public
site, safeguarding) is currently scattered across spreadsheets, group
chats, and consumer apps that were not built for the job. Existing tools
either over-index on chat (Spond, TeamSnap) or on elite-sport performance
data, leaving committee operations as a second-class concern.

Success looks like: a committee runs an entire season inside GatherHub
without exporting to a spreadsheet to do "the real work", every kit
movement is traceable from issue to return, every permission decision is
defensible, and a new committee member can pick up the tool mid-season
without a handover document. The product is multi-tenant by club,
authoritative in Convex, and treats audit as a feature, not a compliance
afterthought.

## Brand Personality

**Trustworthy. Calm. Sharp.**

- **Trustworthy** because volunteers are putting member data, money, and
  child safeguarding into the tool. The product must feel accountable in
  every state — including errors and empty states — never glib, never
  cute about consequential actions.
- **Calm** because users arrive tired, often interrupted, and rarely
  excited to "do admin". The UI should reduce the temperature of the
  task, not raise it. Minimal chrome, no celebratory animations on
  routine work, no urgent-red unless something is actually urgent.
- **Sharp** because the people doing this work are competent adults with
  limited time. Precise language, precise typography, precise data.
  Plain English, no marketing voice, no hand-holding copy that
  re-states the obvious.

Voice: plain, second-person, present tense. "Mark attendance" not "Let's
mark attendance!". Errors say what happened and what to do next. Empty
states explain what would appear there once the user has the data, not
"Nothing here yet 😊".

## Anti-references

GatherHub is explicitly **not** any of the following, and the visual
language must not drift toward them:

- **Spond, TeamSnap, Heja, club chat apps.** No chat-thread-first
  information architecture, no consumer-y baby-blue palette, no emoji
  reactions on operational records, no kid-app illustration style.
  Committee work is not a group chat.
- **Generic SaaS dashboard template.** No purple-to-pink gradient
  accents, no hero metric tiles with sparkline + percent-up arrow as
  the home page, no identical icon-and-heading card grids, no
  glassmorphism as decoration, no gradient text. The pasted brief that
  seeded this project leaned into this lane; reject it.
- **Crypto / AI-startup neon.** No black-with-neon, no animated
  gradient backgrounds, no hero glow, no "intelligent" framing of
  basic CRUD.
- **Enterprise admin panel.** No Bootstrap-density forms, no Material
  elevation stack, no breadcrumb-then-tabs-then-accordion chrome
  layering. Density should come from typography and whitespace
  discipline, not from collapsing everything.
- **Marketing-led "modern SaaS" copy.** No "Supercharge your club",
  no "Empower your committee", no exclamation marks in product copy.

## Design Principles

1. **Server is truth; the UI never lies.** Permissions, roles, audit
   state, and multi-tenant scoping are enforced server-side in Convex.
   The UI must reflect that reality precisely: loading, permission-denied,
   stale, and conflict states are first-class screens, not afterthoughts.
   No optimistic rendering that hides a failed write.
2. **Audit-first: every action is a record.** KitTrace, safeguarding,
   and committee accountability mean history matters more than novelty.
   Mutating actions surface who, when, and why; show the audit trail
   inline where it belongs (item detail, member detail), offer undo
   where safe, and log everything regardless.
3. **Respect the volunteer tax.** Users are unpaid and tired. Every
   extra click, modal, or re-entered field is a cost. Default values,
   bulk operations, keyboard shortcuts, and remembered context beat
   wizards and onboarding tours. One-handed phone use must work for
   the pitch-side flows even though desktop is primary.
4. **Boring data wins.** Committee work is list-driven: members, kit,
   attendance, payments, volunteers. Tables, filters, saved views,
   bulk actions, and exports are the home page of most sections.
   Resist the urge to put hero charts where a sortable list does the
   real job.

## Accessibility & Inclusion

Target **WCAG 2.2 AA** across the product, with the public QR landing
pages and authentication flows held to the higher end of AA (4.5:1 body
contrast, 44px minimum touch targets, full keyboard reachability).

Specific commitments:

- Full keyboard navigation, including the command palette, tables,
  drawers, and modals. Visible focus states use a token, not browser
  default.
- Screen reader support for all data tables, status indicators, and
  audit log entries. Status conveyed by colour is also conveyed by
  icon and text.
- `prefers-reduced-motion` respected everywhere; non-essential motion
  disables, essential transitions shorten to opacity-only.
- Contrast verified at the token layer, not per component, so theme
  changes cannot silently break it.
- Plain-English labels and errors; avoid jargon that assumes prior
  sports-admin software experience.
- The iOS field-ops app inherits the same intent: large touch targets,
  high contrast in daylight, gloved-hand-friendly controls.
