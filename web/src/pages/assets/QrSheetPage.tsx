import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { ArrowLeft, Printer } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shared";
import { QrCode, assetTagUrl } from "@/components/QrCode";

/**
 * Printable sheet of QR codes for KitTrace assets. Reads the same filter
 * params as the assets list (status, category, search), then renders an
 * A4-friendly grid that prints clean (chrome hidden via @media print).
 */
export default function QrSheetPage() {
  const [params] = useSearchParams();
  const status = params.get("status") ?? undefined;
  const category = params.get("category") ?? undefined;
  const search = params.get("search") ?? undefined;

  const assets = useQuery(api.assets.list, {
    status:
      status === "all" || !status
        ? undefined
        : (status as
            | "available"
            | "checked_out"
            | "in_use"
            | "maintenance"
            | "lost"
            | "retired"),
    category: category === "all" || !category ? undefined : category,
    search: search || undefined,
  });

  if (assets === undefined) return <LoadingState />;

  const printable = assets.filter((a) => Boolean(a.qrTagId));

  return (
    <div className="qr-sheet">
      <style>{PRINT_CSS}</style>
      <header className="qr-sheet__chrome mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/assets">
            <ArrowLeft className="h-4 w-4" /> KitTrace
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-caption text-ink-quiet">
            <span data-numeric className="font-medium text-ink-soft">
              {printable.length}
            </span>{" "}
            QR labels{" "}
            {assets.length > printable.length &&
              ` · ${assets.length - printable.length} asset${assets.length - printable.length === 1 ? "" : "s"} without QR skipped`}
          </span>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </header>

      <div className="qr-sheet__intro qr-sheet__chrome mb-6 max-w-prose text-body text-ink-soft">
        Each label prints with a QR code, the asset name, and the tag id.
        Cut along the gridlines or print on Avery L7160 (or equivalent
        63.5×38mm) labels.
      </div>

      {printable.length === 0 ? (
        <div className="qr-sheet__chrome py-12 text-center text-body text-ink-quiet">
          No assets with QR codes match the current filter.
        </div>
      ) : (
        <ul className="qr-sheet__grid grid grid-cols-3 gap-3">
          {printable.map((a) => (
            <li
              key={a._id}
              className="qr-sheet__cell flex items-center gap-3 rounded-md border border-hairline bg-paper p-3"
            >
              <QrCode value={assetTagUrl(a.qrTagId!)} size={88} />
              <div className="min-w-0 flex-1">
                <p className="text-body-strong text-ink-strong truncate">
                  {a.name}
                </p>
                {a.serialNumber && (
                  <p className="text-caption text-ink-quiet truncate">
                    {a.serialNumber}
                  </p>
                )}
                <code className="block text-mono text-ink-quiet truncate">
                  {a.qrTagId}
                </code>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Print stylesheet hides app chrome and lays out the grid at print-sane sizes.
const PRINT_CSS = `
@media print {
  body { background: white !important; }
  header, aside, nav, .ds-app-shell { display: none !important; }
  .qr-sheet__chrome { display: none !important; }
  .qr-sheet { padding: 0 !important; }
  .qr-sheet__grid { gap: 0 !important; grid-template-columns: repeat(3, 1fr) !important; }
  .qr-sheet__cell {
    border: 1px solid #d4d4d4 !important;
    border-radius: 0 !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
@page { margin: 12mm; }
`;
