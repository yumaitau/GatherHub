#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-shot migration of Belwest soccer registration data into GatherHub.
 *
 * Usage:
 *   1. Dump the Belwest deployment:
 *        cd ../belwest-soccer-registration-system
 *        npx convex export --path ./belwest-dump.zip
 *      then unzip to a directory, e.g. ./belwest-dump/
 *   2. Make sure the GatherHub deployment is up (npm run convex:dev in
 *      this repo at least once so .env.local is populated, or supply
 *      CONVEX_URL + CONVEX_DEPLOY_KEY env vars for a non-dev target).
 *   3. Sign in to GatherHub once with the email you want to own the
 *      imported club (so a users row exists for that email).
 *   4. Run:
 *        node tools/migrate-belwest.mjs \
 *          --dump ../belwest-soccer-registration-system/belwest-dump \
 *          --owner-email you@example.com \
 *          --name "Belwest Soccer Club" \
 *          --slug belwest
 *      Add --dry-run to log only.
 *
 * Auth: uses ConvexHttpClient against the target deployment. Reads
 * CONVEX_URL from web/.env.local by default; deploy key via
 * CONVEX_DEPLOY_KEY env if you're hitting a non-dev deployment.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../web/convex/_generated/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const WEB_ENV = path.join(REPO_ROOT, "web", ".env.local");

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--dump") out.dump = argv[++i];
    else if (k === "--owner-email") out.ownerEmail = argv[++i];
    else if (k === "--owner-user-id") out.ownerUserId = argv[++i];
    else if (k === "--name") out.name = argv[++i];
    else if (k === "--slug") out.slug = argv[++i];
    else if (k === "--dry-run") out.dryRun = true;
    else if (k === "--help" || k === "-h") out.help = true;
  }
  return out;
}

function help() {
  console.log(`migrate-belwest.mjs

  --dump <dir>         Extracted Belwest convex export directory
  --owner-email <em>   Existing GatherHub user email to own the new org
  --name <name>        Org name (default "Belwest Soccer Club")
  --slug <slug>        Org slug (default "belwest")
  --dry-run            Parse and log without writing
  -h --help            Show this help
`);
}

async function readEnv(file) {
  if (!existsSync(file)) return {};
  const txt = await readFile(file, "utf8");
  const out = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

async function readTable(dumpDir, name) {
  // npx convex export --path X.zip → unzip → docs/<table>/documents.jsonl
  const candidates = [
    path.join(dumpDir, "documents", `${name}.jsonl`),
    path.join(dumpDir, `${name}.jsonl`),
    path.join(dumpDir, name, "documents.jsonl"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const txt = await readFile(p, "utf8");
      return txt
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
    }
  }
  console.warn(`! table "${name}" not found in dump, skipping`);
  return [];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function indexById(rows) {
  const out = new Map();
  for (const r of rows) out.set(r._id, r);
  return out;
}

function pickStr(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function pickBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return undefined;
}

function isoToMs(v) {
  if (!v) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }
  if (!args.dump) {
    console.error("--dump <dir> is required");
    process.exit(1);
  }
  if (!args.ownerEmail && !args.ownerUserId) {
    console.error("--owner-email <email> or --owner-user-id <id> is required");
    process.exit(1);
  }
  const env = await readEnv(WEB_ENV);
  const url = process.env.CONVEX_URL || env.VITE_CONVEX_URL || env.CONVEX_URL;
  if (!url) {
    console.error(
      "Convex URL not found. Set CONVEX_URL or VITE_CONVEX_URL in web/.env.local.",
    );
    process.exit(1);
  }
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  console.log(`> target deployment: ${url}`);
  console.log(`> owner email: ${args.ownerEmail}`);
  if (args.dryRun) console.log("> DRY RUN (no writes)");

  const client = new ConvexHttpClient(url);
  if (deployKey && typeof client.setAdminAuth === "function") {
    client.setAdminAuth(deployKey);
  }

  // Read all needed tables.
  console.log("> reading dump...");
  const players = await readTable(args.dump, "players");
  const teams = await readTable(args.dump, "teams");
  const comps = await readTable(args.dump, "competitions");
  const ageGroups = await readTable(args.dump, "ageGroups");
  const divisions = await readTable(args.dump, "divisions");
  const contacts = await readTable(args.dump, "clubContacts");
  const lifetime = await readTable(args.dump, "lifetimeMembers");
  console.log(
    `  players=${players.length} teams=${teams.length} competitions=${comps.length} ageGroups=${ageGroups.length} divisions=${divisions.length} clubContacts=${contacts.length} lifetimeMembers=${lifetime.length}`,
  );

  if (args.dryRun) {
    console.log("(dry run) skipping writes");
    return;
  }

  // 1. Provision org.
  console.log("> provisionOrg...");
  const prov = await client.mutation(api.migrations.belwest.provisionOrg, {
    name: args.name ?? "Belwest Soccer Club",
    slug: args.slug ?? "belwest",
    ownerEmail: args.ownerEmail,
    ownerUserId: args.ownerUserId,
  });
  const orgId = prov.orgId;
  console.log(`  orgId=${orgId}`);

  // 2. Competitions.
  if (comps.length) {
    console.log("> importCompetitions...");
    const compRows = comps
      .map((c) => ({ name: pickStr(c.name), season: pickStr(c.season) }))
      .filter((r) => r.name);
    const r = await client.mutation(
      api.migrations.belwest.importCompetitions,
      { orgId, rows: compRows },
    );
    console.log(`  +${r.created}`);
  }

  // 3. Age groups (labels only).
  if (ageGroups.length) {
    console.log("> importAgeGroups...");
    const labels = ageGroups
      .map((a) => pickStr(a.name) || pickStr(a.label))
      .filter(Boolean);
    const r = await client.mutation(api.migrations.belwest.importAgeGroups, {
      orgId,
      rows: labels,
    });
    console.log(`  +${r.created}`);
  }

  // 4. Divisions.
  if (divisions.length) {
    console.log("> importDivisions...");
    const divRows = divisions
      .map((d) => ({
        name: pickStr(d.name),
        minGrade:
          typeof d.minGrade === "number" ? d.minGrade : undefined,
        maxGrade:
          typeof d.maxGrade === "number" ? d.maxGrade : undefined,
        color: pickStr(d.color),
      }))
      .filter((r) => r.name);
    const r = await client.mutation(api.migrations.belwest.importDivisions, {
      orgId,
      rows: divRows,
    });
    console.log(`  +${r.created}`);
  }

  // Index taxonomies by belwest id so player rows can resolve.
  const compById = indexById(comps);
  const divById = indexById(divisions);
  const ageById = indexById(ageGroups);
  const teamById = indexById(teams);

  // 5. Teams.
  if (teams.length) {
    console.log("> importTeams...");
    const teamRows = teams
      .map((t) => {
        const age = ageById.get(t.ageGroupId);
        return {
          name: pickStr(t.name),
          ageGroup: pickStr(age?.name ?? age?.label),
          season: undefined,
          kitColour: pickStr(t.kitColour),
          kitBagNumber:
            t.kitBagNumber !== undefined
              ? String(t.kitBagNumber)
              : undefined,
          isActive: true,
        };
      })
      .filter((r) => r.name);
    let total = 0;
    for (const batch of chunk(teamRows, 100)) {
      const r = await client.mutation(api.migrations.belwest.importTeams, {
        orgId,
        rows: batch,
      });
      total += r.created;
    }
    console.log(`  +${total}`);
  }

  // 6. Players → members + registrations.
  if (players.length) {
    console.log("> importPlayers...");
    const playerRows = players
      .map((p) => {
        const team = teamById.get(p.teamId);
        const comp = compById.get(p.competitionId);
        const div = divById.get(p.divisionId);
        const age = ageById.get(p.ageGroupId);
        return {
          firstName: pickStr(p.firstName) ?? "Unknown",
          lastName: pickStr(p.lastName) ?? "",
          email: pickStr(p.email),
          phone: pickStr(p.phone),
          dob: pickStr(p.dob),
          gender: pickStr(p.gender),
          schoolName: pickStr(p.schoolName),
          ffaNumber:
            p.ffaNumber !== undefined ? String(p.ffaNumber) : undefined,
          teamName: pickStr(team?.name),
          competitionName: pickStr(comp?.name),
          divisionName: pickStr(div?.name),
          ageGroup: pickStr(age?.name ?? age?.label),
          registered: pickBool(p.registered) ?? false,
          registeredAt: isoToMs(p.registeredDate),
          paid: pickBool(p.registrationPaid) ?? false,
          paidAt: undefined,
          paymentPlan: pickBool(p.paymentPlan),
          paymentPlanStart: pickStr(p.paymentPlanStartDate),
          paymentPlanEnd: pickStr(p.paymentPlanEndDate),
          comments: pickStr(p.comments),
        };
      })
      .filter((r) => r.firstName);
    let totals = { createdMembers: 0, createdRegs: 0, updatedRegs: 0 };
    for (const batch of chunk(playerRows, 50)) {
      const r = await client.mutation(api.migrations.belwest.importPlayers, {
        orgId,
        rows: batch,
      });
      totals.createdMembers += r.createdMembers;
      totals.createdRegs += r.createdRegs;
      totals.updatedRegs += r.updatedRegs;
    }
    console.log(
      `  members +${totals.createdMembers}, regs +${totals.createdRegs}, regs updated ${totals.updatedRegs}`,
    );
  }

  // 7. Club contacts (coaches/managers + WWVP).
  if (contacts.length) {
    console.log("> importClubContacts...");
    const cRows = contacts
      .map((c) => {
        const [firstName, ...rest] = (pickStr(c.name) ?? "").split(/\s+/);
        return {
          firstName: firstName ?? "Unknown",
          lastName: rest.join(" ") || "Contact",
          email: pickStr(c.email),
          phone: pickStr(c.phone),
          role: pickStr(c.role),
          teamName: undefined,
          wwvpStatus: pickStr(c.wwvpStatus),
          wwvpSightedDate: pickStr(c.wwvpSightedDate),
        };
      })
      .filter((r) => r.firstName);
    let totals = { createdMembers: 0, createdWwvp: 0, updatedWwvp: 0 };
    for (const batch of chunk(cRows, 50)) {
      const r = await client.mutation(
        api.migrations.belwest.importClubContacts,
        { orgId, rows: batch },
      );
      totals.createdMembers += r.createdMembers;
      totals.createdWwvp += r.createdWwvp;
      totals.updatedWwvp += r.updatedWwvp;
    }
    console.log(
      `  members +${totals.createdMembers}, wwvp +${totals.createdWwvp}, wwvp updated ${totals.updatedWwvp}`,
    );
  }

  // 8. Lifetime members.
  if (lifetime.length) {
    console.log("> importLifetimeMembers...");
    const rows = lifetime
      .map((l) => ({
        firstName: pickStr(l.firstName) ?? "Unknown",
        lastName: pickStr(l.lastName) ?? "",
        email: pickStr(l.email),
        joinYear: pickStr(l.joinYear),
        firstAddedToClub: pickStr(l.firstAddedToClub),
      }))
      .filter((r) => r.firstName);
    let totals = { created: 0, flagged: 0 };
    for (const batch of chunk(rows, 100)) {
      const r = await client.mutation(
        api.migrations.belwest.importLifetimeMembers,
        { orgId, rows: batch },
      );
      totals.created += r.created;
      totals.flagged += r.flagged;
    }
    console.log(
      `  lifetime members +${totals.created}, existing flagged +${totals.flagged}`,
    );
  }

  // 9. Summary.
  console.log("> summary:");
  const sum = await client.query(api.migrations.belwest.summary, { orgId });
  console.log(JSON.stringify(sum, null, 2));
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
