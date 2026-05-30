import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-[420px] py-20 text-center">
      <p className="text-label text-ink-quiet">Error 404</p>
      <h1 className="mt-2 text-display text-ink-strong">Page not found</h1>
      <p className="mt-3 max-w-prose mx-auto text-body text-ink-soft">
        The page you followed has moved, been renamed, or never existed. Open
        the command palette with ⌘K to jump anywhere.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <Button asChild>
          <Link to="/">Back to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/members">Members</Link>
        </Button>
      </div>
    </div>
  );
}
