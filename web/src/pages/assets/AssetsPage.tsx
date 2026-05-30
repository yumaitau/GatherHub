import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import {
  Plus,
  Package,
  ScanLine,
  Download,
  Search,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  PageHeader,
  LoadingState,
  EmptyState,
  AssetStatusBadge,
} from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { canManageAssets } from "@/lib/roles";
import { humanise, formatCurrency, toCsv, downloadCsv } from "@/lib/utils";

const STATUSES = [
  "available",
  "checked_out",
  "in_use",
  "maintenance",
  "lost",
  "retired",
] as const;

export default function AssetsPage() {
  const { role } = useGatherHub();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");
  const [category, setCategory] = React.useState<string>("all");

  const categories = useQuery(api.taxonomies.list, {
    kind: "asset_category",
  });
  const categoryLabel = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories ?? []) m.set(c.key, c.label);
    return (key: string) => m.get(key) ?? humanise(key);
  }, [categories]);

  const assets = useQuery(api.assets.list, {
    status:
      status === "all" ? undefined : (status as (typeof STATUSES)[number]),
    category: category === "all" ? undefined : category,
    search: search || undefined,
  });

  const canManage = role ? canManageAssets(role) : false;

  function exportCsv() {
    if (!assets) return;
    const rows = assets.map((a) => ({
      name: a.name,
      category: categoryLabel(a.category),
      status: humanise(a.status),
      condition: humanise(a.condition),
      custodian: a.custodianName ?? "",
      location: a.location ?? "",
      replacementValue: a.replacementValue ?? "",
      qrTagId: a.qrTagId ?? "",
      serialNumber: a.serialNumber ?? "",
    }));
    downloadCsv(
      "assets.csv",
      toCsv(rows, [
        "name",
        "category",
        "status",
        "condition",
        "custodian",
        "location",
        "replacementValue",
        "qrTagId",
        "serialNumber",
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title="KitTrace"
        description="Every item, who has it, where it has been."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/assets/scan">
                <ScanLine className="h-4 w-4" /> Scan
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link
                to={{
                  pathname: "/assets/qr-sheet",
                  search: new URLSearchParams({
                    ...(status !== "all" ? { status } : {}),
                    ...(category !== "all" ? { category } : {}),
                    ...(search ? { search } : {}),
                  }).toString(),
                }}
                target="_blank"
                rel="noreferrer"
              >
                <Printer className="h-4 w-4" /> Print QR sheet
              </Link>
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!assets}>
              <Download className="h-4 w-4" /> Export
            </Button>
            {canManage && <CreateAssetDialog />}
          </>
        }
      />

      <section className="rounded-md border border-hairline bg-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-hairline">
          <div className="relative w-full max-w-xs">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-quiet pointer-events-none"
              aria-hidden="true"
            />
            <Input
              placeholder="Search name, serial, tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {humanise(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {assets && (
            <span className="ml-auto text-caption text-ink-quiet">
              <span data-numeric className="font-medium text-ink-soft">
                {assets.length}
              </span>{" "}
              {assets.length === 1 ? "asset" : "assets"}
            </span>
          )}
        </div>

        {assets === undefined ? (
          <LoadingState />
        ) : assets.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No items yet"
            description="Add your first item to start tracking it with QR codes."
            action={canManage ? <CreateAssetDialog /> : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Custodian</TableHead>
                <TableHead>Location</TableHead>
                <TableHead numeric>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((a) => (
                <TableRow key={a._id}>
                  <TableCell>
                    <Link
                      to={`/assets/${a._id}`}
                      className="font-semi text-ink-strong hover:text-primary"
                    >
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-soft">
                    {categoryLabel(a.category)}
                  </TableCell>
                  <TableCell>
                    <AssetStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="text-ink-soft">
                    {a.custodianName ?? "—"}
                  </TableCell>
                  <TableCell className="text-ink-soft">
                    {a.location ?? "—"}
                  </TableCell>
                  <TableCell numeric>
                    {formatCurrency(a.replacementValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function CreateAssetDialog() {
  const create = useMutation(api.assets.create);
  const categories = useQuery(api.taxonomies.list, {
    kind: "asset_category",
  });
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState<string>("");

  React.useEffect(() => {
    if (!category && categories && categories.length > 0) {
      const def = categories.find((c) => c.isDefault) ?? categories[0];
      if (def) setCategory(def.key);
    }
  }, [categories, category]);
  const [value, setValue] = React.useState("");
  const [serial, setSerial] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await create({
        name,
        category,
        serialNumber: serial || undefined,
        location: location || undefined,
        replacementValue: value ? Number(value) : undefined,
      });
      setOpen(false);
      setName("");
      setValue("");
      setSerial("");
      setLocation("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Add asset
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add asset</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="a-name">Name</Label>
            <Input
              id="a-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="a-value">Replacement value (AUD)</Label>
              <Input
                id="a-value"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="a-serial">Serial number</Label>
              <Input
                id="a-serial"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className="font-mono tracking-[0.02em]"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="a-loc">Location</Label>
            <Input
              id="a-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={busy || !name}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
