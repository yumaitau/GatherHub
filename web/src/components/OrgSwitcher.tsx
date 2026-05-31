import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Check, ChevronsUpDown, Plus, Ticket } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { cn, humanise } from "@/lib/utils";

/**
 * Convex-native organisation switcher.
 *
 * Shows the active organisation and a popover menu of every other org the
 * user belongs to. Lets the user create a new organisation or join one with
 * an invite code. All state is read from / written to Convex.
 */
export function OrgSwitcher({ compact = false }: { compact?: boolean }) {
  const memberships = useQuery(api.sync.myMemberships);
  const setActive = useMutation(api.organizations.setActive);
  const [open, setOpen] = React.useState(false);

  const active = memberships?.find((m) => m.isActive);
  const others = memberships?.filter((m) => !m.isActive) ?? [];

  async function switchTo(orgId: Id<"organizations">) {
    try {
      await setActive({ orgId });
      setOpen(false);
      toastSuccess("Organisation switched.");
    } catch (err) {
      toastFailure(err, "Could not switch organisation.");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 h-8 px-2.5",
          "rounded-sm border border-hairline bg-surface text-body text-ink",
          "transition-[background-color,border-color] duration-fast ease-out",
          "hover:bg-surface-sunk hover:border-border-strong",
          "focus-visible:outline-none focus-visible:shadow-focus",
        )}
      >
        <Building2
          className="h-3.5 w-3.5 text-ink-quiet shrink-0"
          aria-hidden="true"
        />
        {!compact && (
          <span className="max-w-[16ch] truncate font-semi">
            {active?.org?.name ?? "Select organisation"}
          </span>
        )}
        <ChevronsUpDown
          className="h-3.5 w-3.5 text-ink-quiet shrink-0"
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className={cn(
              "absolute left-0 z-50 mt-2 w-80",
              "rounded-md border border-hairline bg-popover",
              "shadow-popover overflow-hidden",
              "animate-overlay-in",
            )}
          >
            <div className="px-3 pt-3 pb-1.5 text-label text-ink-quiet">
              Your organisations
            </div>
            {memberships?.length ? (
              <ul className="max-h-72 overflow-auto py-1">
                {[...(active ? [active] : []), ...others].map((m) => (
                  <li key={m.membershipId}>
                    <button
                      type="button"
                      onClick={() => m.org && !m.isActive && switchTo(m.org.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5",
                        "text-body text-ink text-left",
                        "transition-colors duration-fast ease-out",
                        "hover:bg-surface-sunk",
                        "focus-visible:outline-none focus-visible:bg-surface-sunk",
                        m.isActive && "bg-primary-wash hover:bg-primary-wash",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-xs",
                          "border border-hairline bg-paper text-caption font-semi text-ink-strong",
                          m.isActive && "border-primary/40 text-primary",
                        )}
                        aria-hidden="true"
                      >
                        {(m.org?.name ?? "?").slice(0, 1).toUpperCase()}
                      </span>
                      <span className="flex-1 truncate font-semi">
                        {m.org?.name ?? "Unknown"}
                      </span>
                      <Badge variant="muted" className="font-semi">
                        {humanise(m.role)}
                      </Badge>
                      {m.isActive && (
                        <Check
                          className="h-4 w-4 text-primary shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-body text-ink-quiet">
                You have not joined an organisation yet.
              </p>
            )}
            <div className="border-t border-hairline py-1">
              <CreateClubAction onDone={() => setOpen(false)} />
              <JoinClubAction onDone={() => setOpen(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CreateClubAction({ onDone }: { onDone: () => void }) {
  const create = useMutation(api.organizations.create);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({ name });
      setName("");
      setOpen(false);
      onDone();
      toastSuccess("Organisation created.");
    } catch (err) {
      setError(toastFailure(err, "Could not create organisation."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5",
            "text-body text-ink-soft text-left",
            "transition-colors duration-fast ease-out",
            "hover:bg-surface-sunk hover:text-ink",
          )}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-semi">Create a new organisation</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new organisation</DialogTitle>
          <DialogDescription>
            You will become its owner and can invite others with a code.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3 px-6 pb-4">
          <div className="grid gap-1.5">
            <Label htmlFor="org-name">Organisation name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Eastside FC"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create organisation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinClubAction({ onDone }: { onDone: () => void }) {
  const join = useMutation(api.organizations.joinByCode);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await join({ code });
      setCode("");
      setOpen(false);
      onDone();
      toastSuccess("Organisation joined.");
    } catch (err) {
      setError(toastFailure(err, "Invalid invite code."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5",
            "text-body text-ink-soft text-left",
            "transition-colors duration-fast ease-out",
            "hover:bg-surface-sunk hover:text-ink",
          )}
        >
          <Ticket className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-semi">Join with invite code</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join an organisation</DialogTitle>
          <DialogDescription>
            Paste the invite code an admin shared with you.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3 px-6 pb-4">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDEF1234"
              className="font-mono tracking-[0.05em]"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={busy || !code.trim()}>
            {busy ? "Joining…" : "Join organisation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
