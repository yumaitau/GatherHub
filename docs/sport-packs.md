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
tasks, public-site, sponsor, news, fixtures, and match-day roster modules
without creating new soccer-specific records.

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

## Shared Sport Operations

The generic `sport` module now owns the cross-sport operational records:

- `seasons`, `sportCompetitions`, `sportDivisions`, and `venues` for setup.
- `fixtures`, `fixtureTeams`, `officialAssignments`, `fixtureStandings`, and
  `fixtureAuditLog` for scheduling, rescheduling, results metadata, officials,
  standings, and CSV import/export.
- `matchSquads`, `matchSquadMembers`, and `matchParticipationEvents` for
  match-day team sheets, planned lineups, actual participation, positions,
  jersey/bib numbers, captaincy, arrivals, injuries, substitutions, and
  interchange logs.

Roster templates exist for soccer, rugby union, rugby league, cricket, hockey,
netball, basketball, multi-sport, and other sports. They provide position lists,
on-field player guidance, squad-size guidance, bench/reserve settings,
substitution/interchange mode, jersey/bib terminology, and captain/vice-captain
roles. They deliberately validate structure without trying to encode every
competition rule.

On iOS, fixtures and match-day sheets are cached after online sign-in when the
user has `events.read`. Coaches/managers with `events.write` can queue
participation changes offline and manually sync them through the existing sync
queue when connectivity returns.

The remaining sport-generalisation work is to replace soccer-only
registrations, evaluations/grading, match reports, eligibility checks, and
accreditation records with generic sport equivalents while preserving legacy
soccer routes and data.
