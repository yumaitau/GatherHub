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
    await setActive({ orgId });
    setOpen(false);
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <Building2 className="h-4 w-4" />
        {!compact && (
          <span className="max-w-[14ch] truncate">
            {active?.org?.name ?? "Select organisation"}
          </span>
        )}
        <ChevronsUpDown className="h-4 w-4 opacity-60" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-md border bg-popover p-1 shadow-md">
            <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
              Your organisations
            </div>
            {memberships?.length ? (
              <ul className="max-h-72 overflow-auto">
                {[...(active ? [active] : []), ...others].map((m) => (
                  <li key={m.membershipId}>
                    <button
                      type="button"
                      onClick={() =>
                        m.org && !m.isActive && switchTo(m.org.id)
                      }
                      className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <span className="truncate">
                        {m.org?.name ?? "Unknown"}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {m.role}
                        {m.isActive && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                You haven&apos;t joined an organisation yet.
              </p>
            )}
            <div className="mt-1 border-t pt-1">
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create organisation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        >
          <Plus className="h-4 w-4" /> Create a new organisation
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new organisation</DialogTitle>
          <DialogDescription>
            You will become its owner and can invite others with a code.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="org-name">Organisation name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Co."
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create organisation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JoinClubAction({ onDone }: { onDone: () => void }) {
  const join = useMutation(api.organizations.joinByCode);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid invite code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        >
          <Ticket className="h-4 w-4" /> Join with invite code
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join an organisation</DialogTitle>
          <DialogDescription>
            Paste the invite code an admin shared with you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDEF1234"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy || !code.trim()}>
              {busy ? "Joining…" : "Join organisation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
