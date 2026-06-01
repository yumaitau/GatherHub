import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { QrCode, assetTagUrl } from "@/components/QrCode";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import {
  DEFAULT_QR_SETTINGS,
  type CornerSquareStyle,
  type DotStyle,
  type LogoSize,
  type QRSettings,
} from "@/lib/qr/types";

const DOT_STYLES: { value: DotStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dots", label: "Dots" },
  { value: "classy", label: "Classy" },
  { value: "classy-rounded", label: "Classy rounded" },
];

const CORNER_STYLES: { value: CornerSquareStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dots", label: "Dots" },
];

const LOGO_SIZES: { value: LogoSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

/** Sample tag id used in the preview so the user can see what their
 *  config looks like before printing real labels. */
const PREVIEW_TAG = "tag_preview";

export function QrSettingsTab() {
  const { can } = useGatherHub();
  const saved = useQuery(api.qrSettings.get, {});
  const upsert = useMutation(api.qrSettings.upsert);
  const canEdit = can("committee");

  const [s, setS] = React.useState<QRSettings>(DEFAULT_QR_SETTINGS);
  const [logoUrl, setLogoUrl] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Hydrate local form when the server row loads. The server returns
  // looser string types for the enums — narrow back to QRSettings.
  React.useEffect(() => {
    if (!saved) return;
    setS({
      ...DEFAULT_QR_SETTINGS,
      ...saved,
      size: DEFAULT_QR_SETTINGS.size,
      dotStyle: (saved.dotStyle as DotStyle) ?? DEFAULT_QR_SETTINGS.dotStyle,
      cornerSquareStyle:
        (saved.cornerSquareStyle as CornerSquareStyle) ??
        DEFAULT_QR_SETTINGS.cornerSquareStyle,
      logoSize: (saved.logoSize as LogoSize) ?? DEFAULT_QR_SETTINGS.logoSize,
    });
    setLogoUrl(saved.logoUrl ?? "");
  }, [saved]);

  if (saved === undefined) return <LoadingState />;

  function update<K extends keyof QRSettings>(key: K, value: QRSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await upsert({
        fgColor: s.fgColor,
        bgColor: s.bgColor,
        dotStyle: s.dotStyle,
        cornerSquareStyle: s.cornerSquareStyle,
        margin: s.margin,
        logoSize: s.logoSize,
        borderEnabled: s.borderEnabled,
        borderColor: s.borderColor,
        borderWidth: s.borderWidth,
        borderRadius: s.borderRadius,
      });
      toastSuccess("QR style saved.");
    } catch (err) {
      setError(toastFailure(err, "Could not save QR style."));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setS(DEFAULT_QR_SETTINGS);
    setLogoUrl("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-md border border-hairline bg-surface overflow-hidden">
        <header className="px-5 py-3 border-b border-hairline">
          <h2 className="text-title text-ink-strong">QR style</h2>
          <p className="text-caption text-ink-quiet mt-0.5">
            Customise how every KitTrace asset QR is rendered. Saved per
            organisation; applies to the printed sheet and any QR shown in the
            app. Pattern ported from{" "}
            <code className="text-mono">new-indigi-link</code>.
          </p>
        </header>
        <div className="grid gap-5 p-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Dot style">
              <Select
                value={s.dotStyle}
                onValueChange={(v) => update("dotStyle", v as DotStyle)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOT_STYLES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Finder pattern">
              <Select
                value={s.cornerSquareStyle}
                onValueChange={(v) =>
                  update("cornerSquareStyle", v as CornerSquareStyle)
                }
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORNER_STYLES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Foreground colour">
              <ColorRow
                value={s.fgColor}
                onChange={(v) => update("fgColor", v)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Background colour">
              <ColorRow
                value={s.bgColor}
                onChange={(v) => update("bgColor", v)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Quiet zone (modules)">
              <Input
                type="number"
                min={0}
                max={8}
                value={s.margin}
                onChange={(e) => update("margin", Number(e.target.value) || 0)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Logo overlay size">
              <Select
                value={s.logoSize}
                onValueChange={(v) => update("logoSize", v as LogoSize)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGO_SIZES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="qr-logo-url">Logo URL (optional)</Label>
            <Input
              id="qr-logo-url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://your-club.example/logo.png"
              disabled={!canEdit}
            />
            <p className="text-caption text-ink-quiet">
              Paste a publicly reachable PNG / SVG URL. Cropped to a centred
              square with a quiet zone — high-contrast logos read best.
            </p>
          </div>

          <fieldset className="grid gap-3 rounded-md border border-hairline p-3">
            <legend className="px-1 text-caption text-ink-quiet">
              Border (printed outline)
            </legend>
            <label className="inline-flex items-center gap-2 text-body text-ink-soft">
              <input
                type="checkbox"
                checked={s.borderEnabled}
                onChange={(e) => update("borderEnabled", e.target.checked)}
                disabled={!canEdit}
                className="h-4 w-4 accent-primary"
              />
              Draw a border around every QR
            </label>
            {s.borderEnabled && (
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Colour">
                  <ColorRow
                    value={s.borderColor}
                    onChange={(v) => update("borderColor", v)}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Width (px)">
                  <Input
                    type="number"
                    min={0}
                    max={12}
                    value={s.borderWidth}
                    onChange={(e) =>
                      update("borderWidth", Number(e.target.value) || 0)
                    }
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Corner radius">
                  <Input
                    type="number"
                    min={0}
                    max={40}
                    value={s.borderRadius}
                    onChange={(e) =>
                      update("borderRadius", Number(e.target.value) || 0)
                    }
                    disabled={!canEdit}
                  />
                </Field>
              </div>
            )}
          </fieldset>

          {error && <p className="text-caption text-danger">{error}</p>}

          {canEdit && (
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save QR style"}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={saving}>
                Reset to defaults
              </Button>
            </div>
          )}
        </div>
      </section>

      <aside className="rounded-md border border-hairline bg-surface overflow-hidden h-fit sticky top-4">
        <header className="px-5 py-3 border-b border-hairline">
          <h2 className="text-title text-ink-strong">Live preview</h2>
          <p className="text-caption text-ink-quiet mt-0.5">
            Sample tag <code className="text-mono">{PREVIEW_TAG}</code> encoding{" "}
            {assetTagUrl(PREVIEW_TAG)}.
          </p>
        </header>
        <div className="flex flex-col items-center gap-3 p-6">
          <QrCode
            value={assetTagUrl(PREVIEW_TAG)}
            size={240}
            settings={s}
            logoUrl={logoUrl || null}
          />
          <p className="text-caption text-ink-quiet text-center">
            Verify the QR scans on a phone before printing real labels. Higher
            contrast and larger margins read more reliably.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ColorRow({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-9 w-12 cursor-pointer rounded-sm border border-hairline bg-paper"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="font-mono"
      />
    </div>
  );
}
