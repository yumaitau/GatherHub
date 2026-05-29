import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Plus, Package, ScanLine, Download } from "lucide-react";
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

const CATEGORIES = [
  "uniform",
  "kit_bag",
  "ball",
  "training_equipment",
  "goal",
  "gazebo",
  "first_aid",
  "key",
  "device",
  "vehicle",
  "other",
] as const;

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

  const assets = useQuery(api.assets.list, {
    status:
      status === "all" ? undefined : (status as (typeof STATUSES)[number]),
    category:
      category === "all"
        ? undefined
        : (category as (typeof CATEGORIES)[number]),
    search: search || undefined,
  });

  const canManage = role ? canManageAssets(role) : false;

  function exportCsv() {
    if (!assets) return;
    const rows = assets.map((a) => ({
      name: a.name,
      category: humanise(a.category),
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
        description="Track every piece of club kit and equipment."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/assets/scan">
                <ScanLine className="h-4 w-4" /> Scan
              </Link>
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!assets}>
              <Download className="h-4 w-4" /> Export
            </Button>
            {canManage && <CreateAssetDialog />}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search name, serial, tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
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
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {humanise(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {assets === undefined ? (
        <LoadingState />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No assets yet"
          description="Add your first piece of kit to start tracking it with QR codes."
          action={canManage ? <CreateAssetDialog /> : undefined}
        />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Custodian</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((a) => (
                <TableRow key={a._id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link to={`/assets/${a._id}`} className="hover:underline">
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell>{humanise(a.category)}</TableCell>
                  <TableCell>
                    <AssetStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell>{a.custodianName ?? "—"}</TableCell>
                  <TableCell>{a.location ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(a.replacementValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CreateAssetDialog() {
  const create = useMutation(api.assets.create);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [category, setCategory] =
    React.useState<(typeof CATEGORIES)[number]>("other");
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
        <div className="space-y-3">
          <div>
            <Label htmlFor="a-name">Name</Label>
            <Input
              id="a-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) =>
                setCategory(v as (typeof CATEGORIES)[number])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {humanise(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="a-value">Replacement value (AUD)</Label>
              <Input
                id="a-value"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="a-serial">Serial number</Label>
              <Input
                id="a-serial"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="a-loc">Location</Label>
            <Input
              id="a-loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
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
