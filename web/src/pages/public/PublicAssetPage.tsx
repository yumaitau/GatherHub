import { useQuery } from "convex/react";
import { useParams } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Package, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/shared";
import { humanise } from "@/lib/utils";

/**
 * Public QR landing page. Shows ONLY safe, non-sensitive info so a finder can
 * return a lost item. No custodian, value, serial, or history is exposed.
 *
 * AAA-tier contrast and 44px+ touch targets per DESIGN.md commitment for
 * public surfaces.
 */
export default function PublicAssetPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const data = useQuery(api.tags.lookupPublic, { tagId: tagId ?? "" });

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-md items-center gap-2 px-5 py-4">
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
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-12">
        {data === undefined ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !data.found ? (
          <section className="rounded-md border border-hairline bg-surface px-6 py-12 text-center">
            <PackageX
              className="mx-auto mb-3 h-8 w-8 text-ink-quiet"
              aria-hidden="true"
            />
            <h1 className="text-headline text-ink-strong">
              Tag not recognised
            </h1>
            <p className="mt-2 text-body text-ink-soft max-w-prose mx-auto">
              This tag is not registered, or it has been deactivated.
            </p>
          </section>
        ) : (
          <section
            className="rounded-md border border-hairline bg-surface"
            aria-labelledby="asset-title"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-sm bg-primary-wash"
                aria-hidden="true"
              >
                <Package className="h-5 w-5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <h1
                  id="asset-title"
                  className="text-headline text-ink-strong truncate"
                >
                  {data.assetName}
                </h1>
                <p className="text-body text-ink-soft truncate">
                  Belongs to {data.orgName}
                </p>
              </div>
            </div>

            <div className="px-5 py-4 flex flex-wrap items-center gap-2 border-b border-hairline">
              <Badge variant="muted">{humanise(data.category)}</Badge>
              {!data.inService && (
                <Badge variant="outline">Out of service</Badge>
              )}
            </div>

            <div
              className="px-5 py-5 text-body text-ink"
              role="region"
              aria-label="Return instructions"
            >
              <p className="text-label text-ink-quiet mb-1.5">If found</p>
              <p className="whitespace-pre-wrap leading-[1.5rem] max-w-prose">
                {data.message}
              </p>
            </div>
          </section>
        )}

        <p className="mt-6 text-center text-caption text-ink-quiet">
          GatherHub does not store personal data on the tag itself. This page
          shows only what the club has chosen to publish.
        </p>
      </main>
    </div>
  );
}
