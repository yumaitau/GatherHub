import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Plus,
  Package,
  Download,
  Printer,
  History,
  CheckCircle2,
  ExternalLink,
  Pencil,
  Trash2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { DataTable } from "@/components/ui/data-table";
import { LocationInput } from "@/components/location/AddressAutocompleteInput";
import { QrCode, assetTagUrl } from "@/components/QrCode";
import { type ColumnDef } from "@tanstack/react-table";
import {
  PageHeader,
  LoadingState,
  EmptyState,
  AssetStatusBadge,
} from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import {
  humanise,
  formatCurrency,
  toCsv,
  downloadCsv,
  formatDateTime,
  relativeTime,
} from "@/lib/utils";

const STATUSES = [
  "available",
  "checked_out",
  "in_use",
  "maintenance",
  "lost",
  "retired",
] as const;

type KitTracePayload = NonNullable<
  ReturnType<typeof useQuery<typeof api.assets.kitTrace>>
>;
type AssetRow = KitTracePayload["assets"][number];
type HistoryRow = KitTracePayload["history"][number];

const ACTION_VARIANT: Record<
  string,
  "accent" | "success" | "warning" | "destructive" | "muted" | "info"
> = {
  created: "accent",
  updated: "info",
  checked_out: "warning",
  checked_in: "success",
  transferred: "info",
  reported_lost: "destructive",
  maintenance: "warning",
  retired: "muted",
  tag_registered: "accent",
  tag_reassigned: "accent",
  scanned: "info",
};

export default function AssetsPage() {
  const { hasCapability } = useGatherHub();
  const [status, setStatus] = React.useState<string>("all");
  const [category, setCategory] = React.useState<string>("all");
  const kitTrace = useQuery(api.assets.kitTrace, {});

  const categories = useQuery(api.taxonomies.list, {
    kind: "asset_category",
  });
  const categoryLabel = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories ?? []) m.set(c.key, c.label);
    return (key: string) => m.get(key) ?? humanise(key);
  }, [categories]);

  const assets = kitTrace?.assets;
  const historyRows = kitTrace?.history;
  const filteredAssets = React.useMemo(
    () =>
      (assets ?? []).filter((asset) => {
        if (status !== "all" && asset.status !== status) return false;
        if (category !== "all" && asset.category !== category) return false;
        return true;
      }),
    [assets, status, category],
  );
  const checkedOutAssets = React.useMemo(
    () =>
      (assets ?? []).filter(
        (asset) => asset.status === "checked_out" || asset.status === "in_use",
      ),
    [assets],
  );

  const canManage = hasCapability("assets.admin");

  function exportCsv() {
    if (!assets) return;
    const rows = filteredAssets.map((a) => ({
      name: a.name,
      category: categoryLabel(a.category),
      status: humanise(a.status),
      condition: humanise(a.condition),
      custodian: a.custodianName ?? "",
      location: a.location ?? "",
      replacementValue: a.replacementValue ?? "",
      qrTagId: a.qrTagId ?? "",
      serialNumber: a.serialNumber ?? "",
      dueBack: a.dueBack ? new Date(a.dueBack).toISOString() : "",
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
        "dueBack",
      ]),
    );
  }

  function exportHistoryCsv() {
    if (!historyRows) return;
    const rows = historyRows.map((r) => ({
      timestamp: new Date(r.performedAt).toISOString(),
      asset: r.assetName,
      action: r.action,
      actor: r.performerName,
      fromStatus: r.fromStatus ?? "",
      toStatus: r.toStatus ?? "",
      fromCustodian: r.fromCustodianName ?? "",
      toCustodian: r.toCustodianName ?? "",
      fromLocation: r.fromLocation ?? "",
      toLocation: r.toLocation ?? "",
      notes: r.notes ?? "",
    }));
    downloadCsv(
      "asset-history.csv",
      toCsv(rows, [
        "timestamp",
        "asset",
        "action",
        "actor",
        "fromStatus",
        "toStatus",
        "fromCustodian",
        "toCustodian",
        "fromLocation",
        "toLocation",
        "notes",
      ]),
    );
  }

  const assetColumns = React.useMemo<ColumnDef<AssetRow>[]>(
    () =>
      [
        {
          accessorKey: "name",
          header: "Name",
          cell: ({ row }) => (
            <Link
              to={`/assets/${row.original._id}`}
              className="font-semi text-ink-strong hover:text-primary"
            >
              {row.original.name}
            </Link>
          ),
        },
        {
          accessorFn: (a) => categoryLabel(a.category),
          id: "category",
          header: "Category",
          cell: ({ getValue }) => (
            <span className="text-ink-soft">{String(getValue())}</span>
          ),
        },
        {
          accessorKey: "status",
          header: "Status",
          cell: ({ row }) => <AssetStatusBadge status={row.original.status} />,
        },
        {
          accessorKey: "custodianName",
          header: "Custodian",
          cell: ({ row }) => (
            <span className="text-ink-soft">
              {row.original.custodianName ?? "—"}
            </span>
          ),
        },
        {
          accessorKey: "location",
          header: "Location",
          cell: ({ row }) => (
            <span className="text-ink-soft">
              {row.original.location ?? "—"}
            </span>
          ),
        },
        {
          accessorKey: "dueBack",
          header: "Due",
          cell: ({ row }) =>
            row.original.dueBack ? (
              <span className="text-caption text-ink-soft">
                {formatDateTime(row.original.dueBack)}
              </span>
            ) : (
              <span className="text-ink-quiet">—</span>
            ),
        },
        {
          accessorKey: "replacementValue",
          header: "Value",
          meta: { numeric: true },
          cell: ({ row }) => formatCurrency(row.original.replacementValue),
        },
        ...(canManage
          ? [
              {
                id: "actions",
                header: "",
                enableSorting: false,
                meta: { className: "w-[108px]" },
                cell: ({ row }) => (
                  <AssetRowActions asset={row.original} canDelete={canManage} />
                ),
              } satisfies ColumnDef<AssetRow>,
            ]
          : []),
      ] as ColumnDef<AssetRow>[],
    [canManage, categoryLabel],
  );

  const checkedOutColumns = React.useMemo<ColumnDef<AssetRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Item",
        cell: ({ row }) => (
          <Link
            to={`/assets/${row.original._id}`}
            className="font-semi text-ink-strong hover:text-primary"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "custodianName",
        header: "With",
        cell: ({ row }) => (
          <span className="font-semi text-ink">
            {row.original.custodianName ?? "Unassigned"}
          </span>
        ),
      },
      {
        accessorKey: "location",
        header: "Location",
        cell: ({ row }) => row.original.location ?? "—",
      },
      {
        accessorKey: "dueBack",
        header: "Due back",
        cell: ({ row }) =>
          row.original.dueBack ? (
            <span className="text-caption text-ink-soft">
              {formatDateTime(row.original.dueBack)}
            </span>
          ) : (
            <span className="text-ink-quiet">No due date</span>
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <AssetStatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  const historyColumns = React.useMemo<ColumnDef<HistoryRow>[]>(
    () => [
      {
        accessorKey: "performedAt",
        header: "When",
        meta: { className: "whitespace-nowrap" },
        cell: ({ row }) => (
          <div>
            <p className="text-mono text-ink">
              {relativeTime(row.original.performedAt)}
            </p>
            <p className="text-caption text-ink-quiet">
              {formatDateTime(row.original.performedAt)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "assetName",
        header: "Asset",
        cell: ({ row }) => (
          <Link
            to={`/assets/${row.original.assetId}`}
            className="font-semi text-ink-strong hover:text-primary"
          >
            {row.original.assetName}
          </Link>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => (
          <Badge variant={ACTION_VARIANT[row.original.action] ?? "muted"}>
            {humanise(row.original.action)}
          </Badge>
        ),
      },
      {
        accessorKey: "performerName",
        header: "By",
        cell: ({ row }) => (
          <span className="text-ink-soft">{row.original.performerName}</span>
        ),
      },
      {
        id: "transition",
        header: "Details",
        enableSorting: false,
        cell: ({ row }) => <HistoryDetails row={row.original} />,
      },
      {
        accessorKey: "notes",
        header: "Notes",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.notes ? (
            <span className="text-caption text-ink-soft">
              {row.original.notes}
            </span>
          ) : (
            <span className="text-ink-quiet">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="KitTrace"
        description="Every item, who has it, where it has been."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link
                to={{
                  pathname: "/assets/qr-sheet",
                  search: new URLSearchParams({
                    ...(status !== "all" ? { status } : {}),
                    ...(category !== "all" ? { category } : {}),
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

      {assets === undefined ? (
        <LoadingState />
      ) : (
        <div className="grid gap-6">
          <section className="rounded-md border border-hairline bg-surface overflow-hidden">
            <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
              <div>
                <h2 className="text-title text-ink-strong">Checked out now</h2>
                <p className="text-caption text-ink-quiet">
                  Current custody, due dates, and where each item is expected to
                  be.
                </p>
              </div>
              <span className="ml-auto text-caption text-ink-quiet">
                <span data-numeric className="font-medium text-ink-soft">
                  {checkedOutAssets.length}
                </span>{" "}
                {checkedOutAssets.length === 1 ? "item" : "items"}
              </span>
            </header>
            {checkedOutAssets.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Nothing checked out"
                description="Checked out and in-use items will appear here with custodian and location details."
              />
            ) : (
              <DataTable
                data={checkedOutAssets}
                columns={checkedOutColumns}
                getRowId={(r) => r._id}
                searchPlaceholder="Search checked out items"
                defaultPageSize={10}
                hidePagination={checkedOutAssets.length <= 10}
                surface={false}
              />
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-title text-ink-strong">Inventory</h2>
                <p className="text-caption text-ink-quiet">
                  Add, edit, print, and filter all KitTrace assets.
                </p>
              </div>
            </div>
            <DataTable
              data={filteredAssets}
              columns={assetColumns}
              getRowId={(r) => r._id}
              searchPlaceholder="Search name, serial, tag, custodian, location"
              emptyState={
                <EmptyState
                  icon={Package}
                  title="No items yet"
                  description="Add your first item to start tracking it with QR codes."
                  action={canManage ? <CreateAssetDialog /> : undefined}
                />
              }
              toolbar={
                <>
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
                </>
              }
            />
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-title text-ink-strong">History</h2>
                <p className="text-caption text-ink-quiet">
                  Every issue, return, transfer, scan, and tag change across
                  KitTrace.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={exportHistoryCsv}
                disabled={!historyRows || historyRows.length === 0}
              >
                <Download className="h-4 w-4" /> Export history
              </Button>
            </div>
            {historyRows === undefined ? (
              <LoadingState />
            ) : (
              <DataTable
                data={historyRows}
                columns={historyColumns}
                getRowId={(r) => String(r._id)}
                searchPlaceholder="Search asset, action, actor, notes"
                defaultPageSize={25}
                emptyState={
                  <EmptyState
                    icon={History}
                    title="No activity yet"
                    description="Once items are issued, returned, moved, or scanned, the trail will show here."
                  />
                }
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function HistoryDetails({ row }: { row: HistoryRow }) {
  const bits: string[] = [];
  if (row.fromStatus && row.toStatus) {
    bits.push(`${humanise(row.fromStatus)} → ${humanise(row.toStatus)}`);
  }
  if (row.fromCustodianName || row.toCustodianName) {
    bits.push(
      `${row.fromCustodianName ?? "—"} → ${row.toCustodianName ?? "—"}`,
    );
  }
  if (row.fromLocation || row.toLocation) {
    bits.push(`${row.fromLocation ?? "—"} → ${row.toLocation ?? "—"}`);
  }
  return (
    <span className="text-body text-ink-soft">{bits.join(" · ") || "—"}</span>
  );
}

interface EditableAsset {
  _id: Id<"assets">;
  name: string;
  category: string;
  condition: string;
  description?: string;
  serialNumber?: string;
  purchaseDate?: string;
  replacementValue?: number;
  location?: string;
  notes?: string;
  qrTagId?: string;
  nfcTagId?: string;
}

function AssetRowActions({
  asset,
  canDelete,
}: {
  asset: EditableAsset;
  canDelete: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <EditAssetDialog asset={asset} />
      {canDelete && <DeleteAssetDialog asset={asset} />}
    </div>
  );
}

function EditAssetDialog({ asset }: { asset: EditableAsset }) {
  const { org } = useGatherHub();
  const update = useMutation(api.assets.update);
  const categories = useQuery(api.taxonomies.list, {
    kind: "asset_category",
  });
  const conditions = useQuery(api.taxonomies.list, {
    kind: "asset_condition",
  });
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(asset.name);
  const [category, setCategory] = React.useState(asset.category);
  const [condition, setCondition] = React.useState(asset.condition);
  const [serialNumber, setSerialNumber] = React.useState(
    asset.serialNumber ?? "",
  );
  const [purchaseDate, setPurchaseDate] = React.useState(
    asset.purchaseDate ?? "",
  );
  const [replacementValue, setReplacementValue] = React.useState(
    asset.replacementValue !== undefined ? String(asset.replacementValue) : "",
  );
  const defaultLocation = org?.defaultAddress ?? "";
  const [location, setLocation] = React.useState(
    asset.location ?? defaultLocation,
  );
  const [description, setDescription] = React.useState(asset.description ?? "");
  const [notes, setNotes] = React.useState(asset.notes ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(asset.name);
    setCategory(asset.category);
    setCondition(asset.condition);
    setSerialNumber(asset.serialNumber ?? "");
    setPurchaseDate(asset.purchaseDate ?? "");
    setReplacementValue(
      asset.replacementValue !== undefined
        ? String(asset.replacementValue)
        : "",
    );
    setLocation(asset.location ?? defaultLocation);
    setDescription(asset.description ?? "");
    setNotes(asset.notes ?? "");
    setError(null);
  }, [open, asset, defaultLocation]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const valueNum =
        replacementValue.trim() === "" ? undefined : Number(replacementValue);
      if (valueNum !== undefined && Number.isNaN(valueNum)) {
        setError(toastFailure("Replacement value must be a number."));
        return;
      }
      await update({
        assetId: asset._id,
        name: name.trim(),
        category,
        condition,
        serialNumber: serialNumber.trim() || undefined,
        purchaseDate: purchaseDate || undefined,
        replacementValue: valueNum,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      toastSuccess("Asset updated.");
    } catch (err) {
      setError(toastFailure(err, "Could not update asset."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${asset.name}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Edit asset</DialogTitle>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-name`}>Name</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
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
            <div className="grid gap-1.5">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(conditions ?? []).map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${formId}-serial`}>Serial number</Label>
              <Input
                id={`${formId}-serial`}
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${formId}-value`}>Replacement value</Label>
              <Input
                id={`${formId}-value`}
                type="number"
                value={replacementValue}
                onChange={(e) => setReplacementValue(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${formId}-purchase`}>Purchase date</Label>
              <Input
                id={`${formId}-purchase`}
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${formId}-location`}>Location</Label>
              <LocationInput
                id={`${formId}-location`}
                value={location}
                onChange={setLocation}
              />
            </div>
          </div>
          <div className="grid gap-3 rounded-md border border-hairline bg-surface-sunk/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {asset.qrTagId ? (
                <div className="rounded-md border border-hairline bg-paper p-3">
                  <QrCode value={assetTagUrl(asset.qrTagId)} size={104} />
                </div>
              ) : null}
              <div className="min-w-0 space-y-1">
                <p className="text-body-strong text-ink-strong">QR code</p>
                {asset.qrTagId ? (
                  <>
                    <code className="block break-all text-mono text-ink">
                      {asset.qrTagId}
                    </code>
                    <p className="break-all text-caption text-ink-soft">
                      {assetTagUrl(asset.qrTagId)}
                    </p>
                  </>
                ) : (
                  <p className="text-body text-ink-soft">
                    No QR code has been generated for this asset.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-description`}>Description</Label>
            <Textarea
              id={`${formId}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-notes`}>Notes</Label>
            <Textarea
              id={`${formId}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAssetDialog({ asset }: { asset: EditableAsset }) {
  const remove = useMutation(api.assets.remove);
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setDeleting(true);
    setError(null);
    try {
      await remove({ assetId: asset._id });
      setOpen(false);
      toastSuccess("Asset deleted.");
    } catch (err) {
      setError(toastFailure(err, "Could not delete asset."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${asset.name}`}
          className="text-danger hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-body text-ink">
          <p>
            Delete{" "}
            <span className="font-semi text-ink-strong">{asset.name}</span>?
          </p>
          <p className="text-ink-soft">
            This removes the asset and its QR/NFC tags from KitTrace. Existing
            audit history is retained for the organisation record.
          </p>
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={submit} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateAssetDialog() {
  const { org } = useGatherHub();
  const navigate = useNavigate();
  const create = useMutation(api.assets.create);
  const categories = useQuery(api.taxonomies.list, {
    kind: "asset_category",
  });
  const [open, setOpen] = React.useState(false);
  const [createdAssetId, setCreatedAssetId] =
    React.useState<Id<"assets"> | null>(null);
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState<string>("");
  const defaultLocation = org?.defaultAddress ?? "";
  const createdDetail = useQuery(
    api.assets.get,
    createdAssetId ? { assetId: createdAssetId } : "skip",
  );
  const createdAsset = createdDetail?.asset;

  React.useEffect(() => {
    if (!category && categories && categories.length > 0) {
      const def = categories.find((c) => c.isDefault) ?? categories[0];
      if (def) setCategory(def.key);
    }
  }, [categories, category]);
  const [value, setValue] = React.useState("");
  const [serial, setSerial] = React.useState("");
  const [location, setLocation] = React.useState(defaultLocation);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function resetForm() {
    setCreatedAssetId(null);
    setName("");
    setValue("");
    setSerial("");
    setLocation(defaultLocation);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  React.useEffect(() => {
    if (open) setLocation((current) => current || defaultLocation);
  }, [open, defaultLocation]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const assetId = await create({
        name,
        category,
        serialNumber: serial || undefined,
        location: location.trim() || undefined,
        replacementValue: value ? Number(value) : undefined,
      });
      setCreatedAssetId(assetId);
      toastSuccess("Asset created. QR code ready to print.");
      setName("");
      setValue("");
      setSerial("");
      setLocation(defaultLocation);
    } catch (e) {
      setError(toastFailure(e, "Could not create asset."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Add asset
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {createdAssetId ? "Asset created" : "Add asset"}
          </DialogTitle>
        </DialogHeader>
        {createdAssetId ? (
          <div className="grid gap-5">
            <div className="flex items-start gap-3 rounded-md border border-hairline bg-surface-sunk/50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div>
                <p className="text-body-strong text-ink-strong">
                  QR code created for {createdAsset?.name ?? "this asset"}.
                </p>
                <p className="mt-1 text-body text-ink-soft">
                  Print this QR label and attach it to the asset. The iOS app
                  can scan it to open this asset record.
                </p>
              </div>
            </div>

            {createdAsset?.qrTagId ? (
              <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div className="rounded-md border border-hairline bg-paper p-4">
                  <QrCode
                    value={assetTagUrl(createdAsset.qrTagId)}
                    size={176}
                  />
                </div>
                <div className="min-w-0 space-y-3 text-body">
                  <div>
                    <span className="text-caption text-ink-quiet">Tag id</span>
                    <code className="block break-all text-mono text-ink">
                      {createdAsset.qrTagId}
                    </code>
                  </div>
                  <div>
                    <span className="text-caption text-ink-quiet">
                      Lookup URL
                    </span>
                    <p className="break-all text-mono text-ink">
                      {assetTagUrl(createdAsset.qrTagId)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-hairline bg-surface p-4 text-body text-ink-soft">
                Preparing QR code…
              </div>
            )}
          </div>
        ) : (
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <LocationInput
                id="a-loc"
                value={location}
                onChange={setLocation}
              />
            </div>
            {error && <p className="text-caption text-danger">{error}</p>}
          </div>
        )}
        {createdAssetId ? (
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              <Plus className="h-4 w-4" /> Add another
            </Button>
            <Button variant="outline" asChild>
              <Link to="/assets/qr-sheet" target="_blank" rel="noreferrer">
                <Printer className="h-4 w-4" /> Print QR sheet
              </Link>
            </Button>
            <Button
              onClick={() => {
                const id = createdAssetId;
                resetForm();
                setOpen(false);
                navigate(`/assets/${id}`);
              }}
            >
              <ExternalLink className="h-4 w-4" /> Open asset
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={submit}
              disabled={busy || !name.trim() || !category}
            >
              Create
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
