import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/shared";
import { toastFailure, toastSuccess } from "@/lib/feedback";

/** Settings for field-service job types, exception reasons, and proof rules. */
export function FieldServiceSettingsTab() {
  const config = useQuery(api.fieldService.getConfig, {});
  const update = useMutation(api.fieldService.updateConfig);
  const [jobTypes, setJobTypes] = React.useState("");
  const [exceptionReasons, setExceptionReasons] = React.useState("");
  const [requirePhoto, setRequirePhoto] = React.useState(false);
  const [requireSignature, setRequireSignature] = React.useState(false);
  const [requireScan, setRequireScan] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (config && !loaded) {
      setJobTypes(config.jobTypes.join("\n"));
      setExceptionReasons(config.exceptionReasons.join("\n"));
      setRequirePhoto(config.requirePhoto);
      setRequireSignature(config.requireSignature);
      setRequireScan(config.requireScan);
      setLoaded(true);
    }
  }, [config, loaded]);

  if (config === undefined) return <LoadingState />;

  const toLines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  async function save() {
    setSaving(true);
    try {
      await update({
        jobTypes: toLines(jobTypes),
        exceptionReasons: toLines(exceptionReasons),
        requirePhoto,
        requireSignature,
        requireScan,
      });
      toastSuccess("Field service settings saved.");
    } catch (err) {
      toastFailure(err, "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid max-w-prose gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Job types & exception reasons</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="fs-types">Job types (one per line)</Label>
            <Textarea
              id="fs-types"
              rows={4}
              value={jobTypes}
              onChange={(e) => setJobTypes(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fs-reasons">Exception reasons (one per line)</Label>
            <Textarea
              id="fs-reasons"
              rows={4}
              value={exceptionReasons}
              onChange={(e) => setExceptionReasons(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proof-of-service requirements</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2.5">
          <ProofToggle
            label="Require a signature to complete a job"
            checked={requireSignature}
            onChange={setRequireSignature}
          />
          <ProofToggle
            label="Require a photo to complete a job"
            checked={requirePhoto}
            onChange={setRequirePhoto}
          />
          <ProofToggle
            label="Require a scan (bin / asset) to complete a job"
            checked={requireScan}
            onChange={setRequireScan}
          />
        </CardContent>
      </Card>

      <div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

function ProofToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-body text-ink-soft">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      {label}
    </label>
  );
}
