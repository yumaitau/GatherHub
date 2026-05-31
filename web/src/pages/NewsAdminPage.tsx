import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { Newspaper, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { formatDate } from "@/lib/utils";

type NewsPost = {
  _id: Id<"news">;
  title: string;
  body: string;
  excerpt?: string;
  published: boolean;
  publishedAt?: number;
};

export default function NewsAdminPage() {
  const { can } = useGatherHub();
  const news = useQuery(api.news.list, {});
  const update = useMutation(api.news.update);
  const remove = useMutation(api.news.remove);
  const [error, setError] = React.useState<string | null>(null);

  async function togglePublished(post: NewsPost) {
    setError(null);
    try {
      await update({ newsId: post._id, published: !post.published });
      toastSuccess(
        post.published ? "Article unpublished." : "Article published.",
      );
    } catch (err) {
      setError(toastFailure(err, "Could not update article."));
    }
  }

  async function deletePost(post: NewsPost) {
    if (!window.confirm(`Delete "${post.title}"?`)) return;
    setError(null);
    try {
      await remove({ newsId: post._id });
      toastSuccess("Article deleted.");
    } catch (err) {
      setError(toastFailure(err, "Could not delete article."));
    }
  }

  return (
    <div>
      <PageHeader
        title="News"
        description="Manage articles for your public site."
        actions={can("committee") ? <NewsDialog mode="create" /> : undefined}
      />

      {error && <p className="mb-4 text-caption text-danger">{error}</p>}

      {news === undefined ? (
        <LoadingState />
      ) : news.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="No news articles"
          description="Write your first article to share organisation news."
          action={can("committee") ? <NewsDialog mode="create" /> : undefined}
        />
      ) : (
        <section className="rounded-md border border-hairline bg-surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published</TableHead>
                {can("committee") && <TableHead className="w-40" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {news.map((post) => (
                <TableRow key={post._id}>
                  <TableCell className="font-semi text-ink-strong">
                    {post.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant={post.published ? "success" : "muted"}>
                      {post.published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-ink-quiet">
                    {post.published ? formatDate(post.publishedAt) : "—"}
                  </TableCell>
                  {can("committee") && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePublished(post)}
                        >
                          {post.published ? "Unpublish" : "Publish"}
                        </Button>
                        <NewsDialog mode="edit" post={post} />
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          onClick={() => deletePost(post)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}

function NewsDialog(
  props:
    | { mode: "create"; post?: undefined }
    | { mode: "edit"; post: NewsPost },
) {
  const create = useMutation(api.news.create);
  const update = useMutation(api.news.update);
  const isEdit = props.mode === "edit";
  const post = props.post;

  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(post?.title ?? "");
  const [excerpt, setExcerpt] = React.useState(post?.excerpt ?? "");
  const [body, setBody] = React.useState(post?.body ?? "");
  const [published, setPublished] = React.useState(post?.published ?? false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setTitle(post?.title ?? "");
    setExcerpt(post?.excerpt ?? "");
    setBody(post?.body ?? "");
    setPublished(post?.published ?? false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && post) {
        await update({
          newsId: post._id,
          title,
          excerpt: excerpt.trim() || undefined,
          body,
          published,
        });
      } else {
        await create({
          title,
          excerpt: excerpt.trim() || undefined,
          body,
          published,
        });
      }
      reset();
      setOpen(false);
      toastSuccess(isEdit ? "Article updated." : "Article created.");
    } catch (err) {
      setError(toastFailure(err, "Could not save article."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" />
            New article
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit article" : "New article"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update this news article."
                : "Write a new news article."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="news-title">Title</Label>
              <Input
                id="news-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="news-excerpt">Excerpt</Label>
              <Input
                id="news-excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="news-body">Body</Label>
              <Textarea
                id="news-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[160px]"
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="h-4 w-4"
              />
              Published
            </label>
            {error && <p className="text-caption text-danger">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
