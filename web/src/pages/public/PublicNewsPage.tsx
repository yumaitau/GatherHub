import { useQuery } from "convex/react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { ArrowLeft } from "lucide-react";
import { Spinner } from "@/components/shared";
import { formatDate } from "@/lib/utils";

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
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (article === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <h1 className="text-2xl font-bold">Article not found</h1>
        <Link to={`/club/${slug}`} className="text-primary hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <article className="mx-auto max-w-2xl px-4 py-12">
        <Link
          to={`/club/${slug}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {article.orgName}
        </Link>
        {article.coverImageUrl && (
          <img
            src={article.coverImageUrl}
            alt=""
            className="mb-6 w-full rounded-lg object-cover"
          />
        )}
        <h1 className="text-3xl font-bold">{article.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(article.publishedAt)}
        </p>
        <div className="prose mt-6 max-w-none whitespace-pre-line">
          {article.body}
        </div>
      </article>
    </div>
  );
}
