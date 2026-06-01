/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as announcements from "../announcements.js";
import type * as assetOps from "../assetOps.js";
import type * as assets from "../assets.js";
import type * as certifications from "../certifications.js";
import type * as clerk from "../clerk.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as fixtures from "../fixtures.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as invitationsAdmin from "../invitationsAdmin.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_capabilities from "../lib/capabilities.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_orgConfig from "../lib/orgConfig.js";
import type * as lib_uploads from "../lib/uploads.js";
import type * as members from "../members.js";
import type * as news from "../news.js";
import type * as organizations from "../organizations.js";
import type * as publicSite from "../publicSite.js";
import type * as qrSettings from "../qrSettings.js";
import type * as roles from "../roles.js";
import type * as seed from "../seed.js";
import type * as soccer from "../soccer.js";
import type * as sponsors from "../sponsors.js";
import type * as sync from "../sync.js";
import type * as syncClerk from "../syncClerk.js";
import type * as tags from "../tags.js";
import type * as taskReminderEmailSender from "../taskReminderEmailSender.js";
import type * as taskReminderEmails from "../taskReminderEmails.js";
import type * as tasks from "../tasks.js";
import type * as taxonomies from "../taxonomies.js";
import type * as teams from "../teams.js";
import type * as volunteers from "../volunteers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  announcements: typeof announcements;
  assetOps: typeof assetOps;
  assets: typeof assets;
  certifications: typeof certifications;
  clerk: typeof clerk;
  crons: typeof crons;
  dashboard: typeof dashboard;
  events: typeof events;
  files: typeof files;
  fixtures: typeof fixtures;
  http: typeof http;
  invitations: typeof invitations;
  invitationsAdmin: typeof invitationsAdmin;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/capabilities": typeof lib_capabilities;
  "lib/idempotency": typeof lib_idempotency;
  "lib/ids": typeof lib_ids;
  "lib/orgConfig": typeof lib_orgConfig;
  "lib/uploads": typeof lib_uploads;
  members: typeof members;
  news: typeof news;
  organizations: typeof organizations;
  publicSite: typeof publicSite;
  qrSettings: typeof qrSettings;
  roles: typeof roles;
  seed: typeof seed;
  soccer: typeof soccer;
  sponsors: typeof sponsors;
  sync: typeof sync;
  syncClerk: typeof syncClerk;
  tags: typeof tags;
  taskReminderEmailSender: typeof taskReminderEmailSender;
  taskReminderEmails: typeof taskReminderEmails;
  tasks: typeof tasks;
  taxonomies: typeof taxonomies;
  teams: typeof teams;
  volunteers: typeof volunteers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
