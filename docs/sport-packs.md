# Sport Packs

GatherHub now treats soccer as one sport pack instead of the product default.
The generic organisation profile stores:

- `kind`: broad organisation class, such as `sports_club` or `waste_operator`.
- `templateKey`: the selected setup template, such as `rugby_union_club`.
- `sportKey`: the configured sport pack, such as `soccer`, `rugby_union`,
  `rugby_league`, `cricket`, `hockey`, `netball`, `basketball`, or
  `multi_sport`.
- `organizationModules`: enabled modules. The `sport` module is generic; the
  `soccer` module is a compatibility submodule for legacy soccer registration
  and grading storage.
- `terminology`: user-facing vocabulary for teams, fixtures, competitions,
  divisions/grades, registrations, and grading.

## Compatibility Model

Existing soccer tenants continue to work through `soccerMode`, `soccer*`
tables, and legacy `/soccer/*` routes. The current context resolves legacy
`soccerMode` organisations to `sportKey: "soccer"` and exposes the same data
under the primary `/sport/*` routes.

New non-soccer sport templates enable `sport` without enabling the `soccer`
submodule. That lets rugby, cricket, hockey, netball, basketball, and
multi-sport organisations use shared people, teams, events, assets, training,
tasks, public-site, sponsor, and news modules without creating new
soccer-specific records.

## Template Defaults

The built-in sport templates are:

- `sports_club`: generic multi-sport club.
- `soccer_club`: soccer pack plus legacy soccer registration and grading
  screens.
- `rugby_union_club`
- `rugby_league_club`
- `cricket_club`
- `hockey_club`
- `netball_club`
- `basketball_club`

Each template sets modules and terminology together. For example, cricket uses
`side/sides`, `fixture/fixtures`, and `grade/grades`; rugby packs use
`rugby union` or `rugby league` as the sport label and `grade/grades` for
divisions.

## Migration Rules

1. Existing organisations with `soccerMode: true` are treated as the soccer
   sport pack even if `sportKey` has not been written yet.
2. Selecting the Soccer club template writes `sportKey: "soccer"` and keeps the
   `soccer` compatibility module enabled.
3. Selecting any other sport template writes that template's `sportKey`, keeps
   the generic `sport` module enabled, and leaves the `soccer` module disabled.
4. Legacy `/soccer/*` URLs remain usable. New navigation points to `/sport/*`.
5. Native iOS keeps the existing soccer sync operation kinds so queued offline
   operations remain stable for already-shipped clients.

The next migration step is to add generic sport record tables for registrations,
evaluations, fixtures, match reports, and eligibility checks. Until that lands,
non-soccer sport packs use the shared organisation modules and avoid the
soccer compatibility submodule.
