import { useQuery } from "convex/react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { ArrowLeft } from "lucide-react";
import { Spinner } from "@/components/shared";
import { formatDate } from "@/lib/utils";
import { UploadedImageViewer } from "@/components/uploaded-image-viewer";

export default function PublicNewsPage() {
  const { slug, articleSlug } = useParams<{
    slug: string;
    articleSlug: string;
  }>();
  const article = useQuery(api.publicSite.publicNewsArticle, {
    slug: slug ?? "",
    articleSlug: articleSlug ?? "",
  });

  if (article === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner />
      </div>
    );
  }
  if (article === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper px-5 text-center">
        <h1 className="text-headline text-ink-strong">Article not found</h1>
        <Link
          to={`/club/${slug}`}
          className="text-body text-primary hover:underline"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <article className="mx-auto max-w-[680px] px-5 py-12">
        <Link
          to={`/club/${slug}`}
          className="inline-flex items-center gap-1.5 mb-6 text-body text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {article.orgName}
        </Link>
        {article.coverImageUrl && (
          <UploadedImageViewer
            src={article.coverImageUrl}
            alt={`${article.title} cover image`}
            title={`${article.title} cover image`}
            className="mb-7 aspect-video w-full"
            fit="cover"
          />
        )}
        <h1 className="text-display text-ink-strong">{article.title}</h1>
        {article.publishedAt !== undefined && (
          <p className="mt-2 text-body text-ink-quiet">
            <time dateTime={new Date(article.publishedAt).toISOString()}>
              {formatDate(article.publishedAt)}
            </time>
          </p>
        )}
        <div className="mt-7 max-w-prose whitespace-pre-line text-body text-ink leading-[1.625rem]">
          {article.body}
        </div>
      </article>
    </div>
  );
}
