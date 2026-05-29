# Epic 11: Public Website

This epic delivers each organisation's public-facing website: a public profile, home/about/teams/sponsors/contact pages, a news system (schema, list, detail), and public site settings. All public data must be served via safe, whitelisted public queries with no leakage of private information. It builds on orgs (Epic 2), teams (Epic 3), and sponsors (Epic 10).

## Issue 1: Public organisation profile

- **Title:** Public organisation profile
- **Description:** Expose a safe public profile for an organisation (name, logo, blurb, contact) resolvable by slug.
- **Goal:** Each org has a public, slug-addressable profile backing its public site.
- **Acceptance criteria:**
  - [ ] A public query returns whitelisted org fields by slug.
  - [ ] Includes name, logo, description, and public contact.
  - [ ] No member, asset, or private data exposed.
  - [ ] Unknown slug returns a safe not-found.
- **Technical notes:** Slug from the org record (Epic 2 #4). Public query returns an explicit projection (Epic 14 #7). This profile is the data source for the public pages below.
- **Dependencies:** Epic 2 #4 Sync Clerk organisations to Convex
- **Labels:** `area:backend`, `area:web`, `type:security`, `epic:public-site`
- **Estimated effort:** S (2-4h)

## Issue 2: Public home page

- **Title:** Public home page
- **Description:** The landing page for an org's public site, summarising the club with hero, highlights, and links.
- **Goal:** Visitors see an attractive landing page for the club.
- **Acceptance criteria:**
  - [ ] Public route `/c/:slug` renders the home page from public org data.
  - [ ] Shows hero, brief about, latest news, and nav to other public pages.
  - [ ] Responsive and accessible.
  - [ ] Renders without authentication.
- **Technical notes:** Server-safe data only. Latest news from Epic 11 #6/#7. Keep layout reusable across public pages.
- **Dependencies:** Epic 11 #1 Public organisation profile
- **Labels:** `area:web`, `type:feature`, `epic:public-site`
- **Estimated effort:** M (4-8h)

## Issue 3: About page

- **Title:** Public about page
- **Description:** A page describing the club's history, mission, and details, editable via public site settings.
- **Goal:** Visitors can read about the club.
- **Acceptance criteria:**
  - [ ] Public route renders about content from settings.
  - [ ] Supports rich text/markdown content.
  - [ ] Responsive and accessible.
  - [ ] Renders without authentication.
- **Technical notes:** Content stored in public site settings (Issue 10). Sanitise rendered markdown.
- **Dependencies:** Epic 11 #1 Public organisation profile, Epic 11 #10 Public site settings
- **Labels:** `area:web`, `type:feature`, `epic:public-site`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 4: Teams page

- **Title:** Public teams page
- **Description:** A public listing of the club's teams with safe, non-sensitive details.
- **Goal:** Visitors can see the club's teams.
- **Acceptance criteria:**
  - [ ] Public query returns whitelisted team fields (name, age group/division, season).
  - [ ] No rosters, contact, or private data exposed.
  - [ ] Responsive page rendering the teams.
  - [ ] Renders without authentication.
- **Technical notes:** Reuses team data (Epic 3 #8) via a dedicated public projection. Consider an org setting to hide teams entirely.
- **Dependencies:** Epic 11 #1 Public organisation profile, Epic 3 #8 Team schema
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:public-site`
- **Estimated effort:** S (2-4h)

## Issue 5: Sponsors page

- **Title:** Public sponsors page
- **Description:** A public page showcasing sponsors marked as publicly visible, with logos and links.
- **Goal:** Visitors see the club's sponsors, supporting sponsor value.
- **Acceptance criteria:**
  - [ ] Renders only sponsors with public visibility (Epic 10 #9).
  - [ ] Shows logo, name, and website link.
  - [ ] No private sponsor data exposed.
  - [ ] Renders without authentication.
- **Technical notes:** Consumes the public sponsors query (Epic 10 #9). Logos served from Convex storage URLs.
- **Dependencies:** Epic 11 #1 Public organisation profile, Epic 10 #9 Public website visibility
- **Labels:** `area:web`, `type:feature`, `epic:public-site`, `good-first-issue`
- **Estimated effort:** S (2-4h)

## Issue 6: News schema

- **Title:** Define public news schema
- **Description:** Create a `news` table for public posts with title, body, optional cover image, publish state, and dates.
- **Goal:** A typed, indexed table for public news/articles.
- **Acceptance criteria:**
  - [ ] Table includes org id, title, slug, body, cover image ref, published flag, publish date, and timestamps.
  - [ ] Indexed by org id and by published + date.
  - [ ] Draft vs published distinction.
  - [ ] Schema validates required fields.
- **Technical notes:** Distinct from member-facing announcements (Epic 5) which are private. News is public when published. Slug per article for clean URLs.
- **Dependencies:** Epic 2 #7 Add organisation-scoped queries
- **Labels:** `area:backend`, `type:feature`, `epic:public-site`
- **Estimated effort:** S (2-4h)

## Issue 7: News list page

- **Title:** Public news list page
- **Description:** A public, paginated list of published news for the org.
- **Goal:** Visitors can browse club news.
- **Acceptance criteria:**
  - [ ] Public query returns only published news, newest first.
  - [ ] List shows title, snippet, cover, and date.
  - [ ] Pagination for long histories.
  - [ ] Renders without authentication.
- **Technical notes:** Drafts never appear publicly. Uses the published + date index (Issue 6). Authoring UI for staff can reuse a private editor (out of scope here or minimal).
- **Dependencies:** Epic 11 #6 News schema
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:public-site`
- **Estimated effort:** S (2-4h)

## Issue 8: News detail page

- **Title:** Public news detail page
- **Description:** A public page rendering a single published news article by slug.
- **Goal:** Visitors can read a full news article.
- **Acceptance criteria:**
  - [ ] Public route resolves article by org slug + article slug.
  - [ ] Renders title, cover, sanitised body, and date.
  - [ ] Drafts/unknown slugs return safe not-found.
  - [ ] Renders without authentication.
- **Technical notes:** Sanitise markdown/HTML on render. Only published articles resolve; unpublished return not-found regardless of existence.
- **Dependencies:** Epic 11 #6 News schema, Epic 11 #7 News list page
- **Labels:** `area:web`, `type:feature`, `epic:public-site`
- **Estimated effort:** S (2-4h)

## Issue 9: Contact page

- **Title:** Public contact page
- **Description:** A public contact page showing the club's public contact details and an optional contact form.
- **Goal:** Visitors can find how to contact the club.
- **Acceptance criteria:**
  - [ ] Renders public contact info from settings/profile.
  - [ ] Optional contact form submits a message (rate-limited, validated).
  - [ ] No private data exposed.
  - [ ] Renders without authentication.
- **Technical notes:** If a contact form is included, validate and rate-limit submissions and store/forward safely; otherwise show contact details only. Guard against spam.
- **Dependencies:** Epic 11 #1 Public organisation profile, Epic 11 #10 Public site settings
- **Labels:** `area:web`, `area:backend`, `type:feature`, `epic:public-site`
- **Estimated effort:** S (2-4h)

## Issue 10: Public site settings

- **Title:** Public site settings
- **Description:** Staff-managed settings controlling public site content and visibility (about text, contact info, which sections show, theme/logo).
- **Goal:** Staff can configure their public site without code.
- **Acceptance criteria:**
  - [ ] Settings table/fields for about content, contact, section toggles, and branding.
  - [ ] Editable by Owner/Admin/Committee only.
  - [ ] Public pages read from these settings.
  - [ ] Sensible defaults when unset.
- **Technical notes:** Keep a single settings record per org. Public reads use a whitelisted projection; edits are role-gated. Toggles let orgs hide teams/sponsors/news if desired.
- **Dependencies:** Epic 11 #1 Public organisation profile, Epic 2 #5 Implement role model
- **Labels:** `area:backend`, `area:web`, `type:feature`, `epic:public-site`
- **Estimated effort:** M (4-8h)
