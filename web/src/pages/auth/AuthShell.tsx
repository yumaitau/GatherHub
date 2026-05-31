import * as React from "react";

interface AuthShellProps {
  heading: string;
  caption?: string;
  children: React.ReactNode;
}

/**
 * Two-column auth shell. Quiet paper field on the left (form), tinted
 * institutional plate on the right (brand reminder), single column on mobile.
 * Used by SignIn and invitation-only SignUp.
 */
export function AuthShell({ heading, caption, children }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col md:grid md:grid-cols-2">
      <header className="md:hidden border-b border-hairline">
        <div className="px-5 py-4 flex items-center gap-2">
          <Wordmark />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <div className="hidden md:flex items-center gap-2 mb-8">
            <Wordmark />
          </div>
          <h1 className="text-headline text-ink-strong">{heading}</h1>
          {caption && (
            <p className="mt-1.5 text-body text-ink-soft max-w-prose">
              {caption}
            </p>
          )}
          <div className="mt-7">{children}</div>
        </div>
      </main>
      <aside className="hidden md:flex bg-surface border-l border-hairline flex-col justify-between px-12 py-10">
        <div />
        <div className="max-w-[420px]">
          <p className="text-label text-ink-quiet mb-3">GatherHub</p>
          <p className="text-headline text-ink-strong tracking-[-0.012em]">
            Run your club without the spreadsheet.
          </p>
          <p className="mt-3 text-body text-ink-soft max-w-prose">
            Members, teams, attendance, kit, volunteers, sponsors, and a basic
            public website. One operating system for committees.
          </p>
        </div>
        <p className="text-caption text-ink-quiet">
          Multi-tenant by club, authoritative in Convex.
        </p>
      </aside>
    </div>
  );
}

function Wordmark() {
  return (
    <a
      href="/"
      aria-label="GatherHub home"
      className="inline-flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:shadow-focus"
    >
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width={28}
        height={28}
        className="h-7 w-7 shrink-0"
      />
      <span className="text-body-strong text-ink-strong tracking-[-0.012em]">
        GatherHub
      </span>
    </a>
  );
}
