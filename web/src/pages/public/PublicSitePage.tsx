import { useQuery } from "convex/react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Mail, Phone, MapPin, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/shared";
import { formatDate } from "@/lib/utils";

export default function PublicSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const data = useQuery(api.publicSite.publicProfile, { slug: slug ?? "" });

  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Organisation not found</h1>
        <p className="text-muted-foreground">
          This organisation doesn't have a public website, or the link is incorrect.
        </p>
      </div>
    );
  }

  const { org, settings, teams, sponsors, news } = data;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="bg-primary px-4 py-16 text-primary-foreground">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold">{org.name}</h1>
          {settings.tagline && (
            <p className="mt-2 text-lg opacity-90">{settings.tagline}</p>
          )}
        </div>
      </header>

      <nav className="border-b">
        <div className="mx-auto flex max-w-4xl gap-6 overflow-x-auto px-4 py-3 text-sm font-medium">
          <a href="#about">About</a>
          <a href="#teams">Teams</a>
          <a href="#news">News</a>
          <a href="#sponsors">Sponsors</a>
          <a href="#contact">Contact</a>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl space-y-12 px-4 py-12">
        {settings.about && (
          <section id="about">
            <h2 className="mb-3 text-2xl font-semibold">About us</h2>
            <p className="whitespace-pre-line text-muted-foreground">
              {settings.about}
            </p>
          </section>
        )}

        <section id="teams">
          <h2 className="mb-3 text-2xl font-semibold">Our teams</h2>
          {teams.length === 0 ? (
            <p className="text-muted-foreground">No teams listed yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {[t.ageGroup, t.season].filter(Boolean).join(" · ")}
                    </p>
                    {t.description && (
                      <p className="mt-2 text-sm">{t.description}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="news">
          <h2 className="mb-3 text-2xl font-semibold">Latest news</h2>
          {news.length === 0 ? (
            <p className="text-muted-foreground">No news yet.</p>
          ) : (
            <div className="space-y-4">
              {news.map((n) => (
                <Link key={n.id} to={`/club/${slug}/news/${n.slug}`}>
                  <Card className="transition-colors hover:bg-accent/40">
                    <CardContent className="flex gap-4 p-4">
                      {n.coverImageUrl && (
                        <img
                          src={n.coverImageUrl}
                          alt=""
                          className="h-20 w-20 rounded object-cover"
                        />
                      )}
                      <div>
                        <h3 className="font-semibold">{n.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(n.publishedAt)}
                        </p>
                        {n.excerpt && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {n.excerpt}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section id="sponsors">
          <h2 className="mb-3 text-2xl font-semibold">Our sponsors</h2>
          {sponsors.length === 0 ? (
            <p className="text-muted-foreground">No sponsors listed.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              {sponsors.map((s) => (
                <a
                  key={s.id}
                  href={s.website ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1"
                >
                  {s.logoUrl ? (
                    <img
                      src={s.logoUrl}
                      alt={s.name}
                      className="h-16 w-auto object-contain"
                    />
                  ) : (
                    <div className="grid h-16 w-32 place-items-center rounded border bg-muted text-sm font-medium">
                      {s.name}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </section>

        <section id="contact">
          <h2 className="mb-3 text-2xl font-semibold">Contact</h2>
          <div className="space-y-2 text-sm">
            {settings.contactEmail && (
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${settings.contactEmail}`}>
                  {settings.contactEmail}
                </a>
              </p>
            )}
            {settings.contactPhone && (
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {settings.contactPhone}
              </p>
            )}
            {settings.address && (
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {settings.address}
              </p>
            )}
            {settings.websiteUrl && (
              <p className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <a href={settings.websiteUrl} target="_blank" rel="noreferrer">
                  {settings.websiteUrl}
                </a>
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        {org.name} · Powered by GatherHub
      </footer>
    </div>
  );
}
