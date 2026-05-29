import { useQuery } from "convex/react";
import { useParams } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Package, PackageX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/shared";
import { humanise } from "@/lib/utils";

/**
 * Public QR landing page. Shows ONLY safe, non-sensitive info so a finder can
 * return a lost item. No custodian, value, serial, or history is exposed.
 */
export default function PublicAssetPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const data = useQuery(api.tags.lookupPublic, { tagId: tagId ?? "" });

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-16">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 font-bold text-xl">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            G
          </span>
          GatherHub
        </div>

        {data === undefined ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : !data.found ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <PackageX className="h-10 w-10 text-muted-foreground" />
              <h1 className="text-lg font-semibold">Tag not recognised</h1>
              <p className="text-sm text-muted-foreground">
                This tag isn't registered, or it has been deactivated.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-4 py-8 text-center">
              <Package className="mx-auto h-10 w-10 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">{data.assetName}</h1>
                <p className="text-sm text-muted-foreground">
                  Belongs to {data.orgName}
                </p>
              </div>
              <div className="flex justify-center gap-2">
                <Badge variant="secondary">{humanise(data.category)}</Badge>
                <Badge variant="outline">{humanise(data.status)}</Badge>
              </div>
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                {data.message}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
