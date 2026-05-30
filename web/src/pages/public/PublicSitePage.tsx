import { useQuery } from "convex/react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Mail, Phone, MapPin, Globe } from "lucide-react";
import { Spinner } from "@/components/shared";
import { formatDate } from "@/lib/utils";

export default function PublicSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const data = useQuery(api.publicSite.publicProfile, { slug: slug ?? "" });

  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner />
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper px-5 text-center">
        <h1 className="text-headline text-ink-strong">
          Organisation not found
        </h1>
        <p className="text-body text-ink-soft max-w-prose">
          This organisation does not have a public website, or the link is
          incorrect.
        </p>
      </div>
    );
  }

  const { org, settings, teams, sponsors, news } = data;

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Header: institutional plate, paper bg, hairline. No drenched primary hero. */}
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto max-w-[960px] px-5 py-12">
          <p className="text-label text-ink-quiet mb-2">Club site</p>
          <h1 className="text-display text-ink-strong tracking-[-0.02em]">
            {org.name}
          </h1>
          {settings.tagline && (
            <p className="mt-3 max-w-prose text-body text-ink-soft">
              {settings.tagline}
            </p>
          )}
        </div>
      </header>

      <nav
        className="sticky top-0 z-20 border-b border-hairline bg-paper/95 backdrop-blur-[2px]"
        aria-label="Public site sections"
      >
        <div className="mx-auto flex max-w-[960px] gap-1 overflow-x-auto px-5 py-2 text-body text-ink-soft">
          {[
            ["about", "About"],
            ["teams", "Teams"],
            ["news", "News"],
            ["sponsors", "Sponsors"],
            ["contact", "Contact"],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex h-9 items-center rounded-sm px-3 hover:bg-surface-sunk hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-[960px] space-y-14 px-5 py-12">
        {settings.about && (
          <section id="about" aria-labelledby="about-heading">
            <h2
              id="about-heading"
              className="text-headline text-ink-strong mb-4"
            >
              About us
            </h2>
            <p className="max-w-prose whitespace-pre-line text-body text-ink leading-[1.625rem]">
              {settings.about}
            </p>
          </section>
        )}

        <section id="teams" aria-labelledby="teams-heading">
          <h2
            id="teams-heading"
            className="text-headline text-ink-strong mb-4"
          >
            Our teams
          </h2>
          {teams.length === 0 ? (
            <p className="text-body text-ink-quiet">No teams listed yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => (
                <li
                  key={t.id}
                  className="rounded-md border border-hairline bg-surface px-4 py-3.5"
                >
                  <h3 className="text-body-strong text-ink-strong">
                    {t.name}
                  </h3>
                  {(t.ageGroup || t.season) && (
                    <p className="mt-0.5 text-caption text-ink-quiet">
                      {[t.ageGroup, t.season].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {t.description && (
                    <p className="mt-2 text-body text-ink-soft max-w-prose">
                      {t.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="news" aria-labelledby="news-heading">
          <h2 id="news-heading" className="text-headline text-ink-strong mb-4">
            Latest news
          </h2>
          {news.length === 0 ? (
            <p className="text-body text-ink-quiet">No news yet.</p>
          ) : (
            <ul className="divide-y divide-hairline rounded-md border border-hairline bg-surface overflow-hidden">
              {news.map((n) => (
                <li key={n.id}>
                  <Link
                    to={`/club/${slug}/news/${n.slug}`}
                    className="group/news flex gap-4 px-4 py-3.5 hover:bg-surface-sunk/60 focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    {n.coverImageUrl && (
                      <img
                        src={n.coverImageUrl}
                        alt=""
                        className="h-16 w-16 rounded-xs border border-hairline object-cover shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-body-strong text-ink-strong group-hover/news:text-primary truncate">
                        {n.title}
                      </h3>
                      <p className="mt-0.5 text-caption text-ink-quiet">
                        <time>{formatDate(n.publishedAt)}</time>
                      </p>
                      {n.excerpt && (
                        <p className="mt-1 text-body text-ink-soft line-clamp-2 max-w-prose">
                          {n.excerpt}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="sponsors" aria-labelledby="sponsors-heading">
          <h2
            id="sponsors-heading"
            className="text-headline text-ink-strong mb-4"
          >
            Our sponsors
          </h2>
          {sponsors.length === 0 ? (
            <p className="text-body text-ink-quiet">No sponsors listed.</p>
          ) : (
            <ul className="flex flex-wrap items-center gap-5">
              {sponsors.map((s) => (
                <li key={s.id}>
                  <a
                    href={s.website ?? "#"}
                    target={s.website ? "_blank" : undefined}
                    rel="noreferrer"
                    className="inline-flex flex-col items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    {s.logoUrl ? (
                      <img
                        src={s.logoUrl}
                        alt={s.name}
                        className="h-14 w-auto object-contain"
                      />
                    ) : (
                      <div className="grid h-14 w-32 place-items-center rounded-xs border border-hairline bg-surface text-caption font-semi text-ink-soft">
                        {s.name}
                      </div>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="contact" aria-labelledby="contact-heading">
          <h2
            id="contact-heading"
            className="text-headline text-ink-strong mb-4"
          >
            Contact
          </h2>
          <dl className="grid gap-2 text-body">
            {settings.contactEmail && (
              <ContactRow icon={Mail}>
                <a
                  href={`mailto:${settings.contactEmail}`}
                  className="text-ink hover:text-primary"
                >
                  {settings.contactEmail}
                </a>
              </ContactRow>
            )}
            {settings.contactPhone && (
              <ContactRow icon={Phone}>
                <span className="text-ink">{settings.contactPhone}</span>
              </ContactRow>
            )}
            {settings.address && (
              <ContactRow icon={MapPin}>
                <span className="text-ink">{settings.address}</span>
              </ContactRow>
            )}
            {settings.websiteUrl && (
              <ContactRow icon={Globe}>
                <a
                  href={settings.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink hover:text-primary break-all"
                >
                  {settings.websiteUrl}
                </a>
              </ContactRow>
            )}
          </dl>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto max-w-[960px] px-5 py-6 flex flex-wrap items-center justify-between gap-2 text-caption text-ink-quiet">
          <span>{org.name}</span>
          <span>
            Powered by{" "}
            <a
              href="/"
              className="text-ink-soft hover:text-ink font-semi"
            >
              GatherHub
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-ink-quiet shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}
