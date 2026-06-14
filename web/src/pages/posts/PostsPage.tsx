import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import {
  MessagesSquare,
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  MessageCircleOff,
  CornerDownRight,
  Eye,
  Settings2,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared";
import { useGatherHub } from "@/lib/gatherhub";
import { moduleEnabled } from "@/lib/verticals";
import { toastFailure, toastSuccess } from "@/lib/feedback";
import { RichText } from "@/components/rich-text/RichText";
import { RichTextEditor } from "@/components/rich-text/RichTextEditor";
import { isHtmlEmpty, plainToHtml } from "@/lib/richtext";
import { cn, relativeTime } from "@/lib/utils";

type ReactionKind = "like" | "love" | "celebrate" | "laugh";

const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "like", emoji: "👍", label: "Like" },
  { kind: "love", emoji: "❤️", label: "Love" },
  { kind: "celebrate", emoji: "🎉", label: "Celebrate" },
  { kind: "laugh", emoji: "😄", label: "Laugh" },
];

type ReactionCounts = Record<ReactionKind, number>;

type PostListItem = {
  _id: Id<"posts">;
  _creationTime: number;
  teamId: Id<"teams"> | null;
  teamName: string | null;
  title: string | null;
  body: string;
  bodyFormat: "plain" | "html";
  commentsDisabled: boolean;
  editedAt: number | null;
  authorUserId: Id<"users">;
  authorName: string | null;
  authorImageUrl: string | null;
  commentCount: number;
  isRead: boolean;
  canEdit: boolean;
  reactionCounts: ReactionCounts;
  myReaction: ReactionKind | null;
};

type CommentItem = {
  _id: Id<"postComments">;
  _creationTime: number;
  postId: Id<"posts">;
  parentCommentId: Id<"postComments"> | null;
  body: string;
  editedAt: number | null;
  authorUserId: Id<"users">;
  authorName: string | null;
  authorImageUrl: string | null;
  canEdit: boolean;
  reactionCounts: ReactionCounts;
  myReaction: ReactionKind | null;
};

type CommentNode = CommentItem & { replies: CommentItem[] };

export default function PostsPage() {
  const { org } = useGatherHub();
  const postsEnabled = moduleEnabled(org, "posts");
  const [audience, setAudience] = React.useState<string>("all");
  const teams = useQuery(api.teams.list, postsEnabled ? {} : "skip");
  const teamId = audience === "all" ? undefined : (audience as Id<"teams">);
  const posts = useQuery(
    api.posts.list,
    postsEnabled ? (teamId ? { teamId } : {}) : "skip",
  );
  const access = useQuery(
    api.posts.myPostingAccess,
    postsEnabled ? {} : "skip",
  );
  const canCompose = Boolean(access?.canPost) || Boolean(access?.canModerate);

  if (!postsEnabled) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Community is off"
        description="Enable the Community module in Settings to share posts and discussions."
        action={
          <Button asChild>
            <Link to="/settings">Open settings</Link>
          </Button>
        }
      />
    );
  }

  const actions = (
    <div className="flex items-center gap-2">
      {access?.canModerate && <PostingSettingsDialog />}
      {canCompose && <NewPostDialog teams={teams ?? []} />}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Community"
        description="Share updates with your organisation and teams. React, comment, and keep the conversation in one place."
        actions={actions}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Label className="text-caption text-ink-quiet">Feed</Label>
        <Select value={audience} onValueChange={setAudience}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All posts</SelectItem>
            {(teams ?? []).map((t) => (
              <SelectItem key={t._id} value={t._id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {teamId && (
          <span className="text-caption text-ink-quiet">
            Showing this team's posts plus org-wide posts.
          </span>
        )}
      </div>

      {posts === undefined ? (
        <LoadingState />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No posts yet"
          description={
            canCompose
              ? "Be the first to post an update."
              : "Nothing has been posted to this feed yet."
          }
          action={
            canCompose ? <NewPostDialog teams={teams ?? []} /> : undefined
          }
        />
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <PostCard key={post._id} post={post as PostListItem} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ post }: { post: PostListItem }) {
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const markRead = useMutation(api.posts.markRead);
  const remove = useMutation(api.posts.remove);
  const update = useMutation(api.posts.update);

  // Full thread (comments + seen count) only loads while expanded.
  const detail = useQuery(
    api.posts.get,
    expanded ? { postId: post._id } : "skip",
  );

  function toggleExpanded() {
    setExpanded((v) => !v);
    if (!post.isRead) {
      markRead({ postId: post._id }).catch(() => {
        /* ignore */
      });
    }
  }

  async function doRemove() {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await remove({ postId: post._id });
      toastSuccess("Post deleted.");
    } catch (err) {
      toastFailure(err, "Could not delete post.");
    }
  }

  async function toggleComments() {
    try {
      await update({
        postId: post._id,
        commentsDisabled: !post.commentsDisabled,
      });
      toastSuccess(
        post.commentsDisabled ? "Comments enabled." : "Comments disabled.",
      );
    } catch (err) {
      toastFailure(err, "Could not update post.");
    }
  }

  const comments = (detail?.comments ?? []) as CommentNode[];

  return (
    <article className="rounded-md border border-hairline bg-surface overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Avatar name={post.authorName} url={post.authorImageUrl} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-strong text-ink-strong">
                  {post.authorName ?? "Unknown"}
                </span>
                <Badge variant={post.teamName ? "muted" : "default"}>
                  {post.teamName ?? "Org-wide"}
                </Badge>
                {!post.isRead && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"
                    aria-label="Unread"
                  />
                )}
              </div>
              <p className="text-caption text-ink-quiet">
                <time>{relativeTime(post._creationTime)}</time>
                {post.editedAt && <span> · edited</span>}
              </p>
            </div>
          </div>
          {post.canEdit && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                title={
                  post.commentsDisabled ? "Enable comments" : "Disable comments"
                }
                onClick={toggleComments}
              >
                {post.commentsDisabled ? (
                  <MessageCircleOff className="h-4 w-4" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Edit"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Delete"
                onClick={doRemove}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {editing ? (
          <EditPostForm post={post} onDone={() => setEditing(false)} />
        ) : (
          <div className="mt-3">
            {post.title && (
              <h3 className="text-body-strong text-ink-strong mb-1">
                {post.title}
              </h3>
            )}
            {post.bodyFormat === "html" ? (
              <RichText html={post.body} />
            ) : (
              <p className="whitespace-pre-wrap text-body text-ink max-w-prose">
                {post.body}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-3">
        <ReactionBar
          postId={post._id}
          counts={post.reactionCounts}
          myReaction={post.myReaction}
        />
      </div>

      <div className="flex items-center gap-4 border-t border-hairline px-5 py-2.5 text-caption text-ink-quiet">
        <button
          type="button"
          onClick={toggleExpanded}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm",
            "hover:text-ink focus-visible:outline-none focus-visible:shadow-focus",
          )}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {post.commentCount === 1
            ? "1 comment"
            : `${post.commentCount} comments`}
        </button>
        {detail && (
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {detail.seenCount === 1 ? "1 seen" : `${detail.seenCount} seen`}
          </span>
        )}
      </div>

      {expanded && (
        <div className="border-t border-hairline bg-surface-sunk/30 px-5 py-4">
          {post.commentsDisabled ? (
            <p className="text-caption text-ink-quiet">
              Comments are turned off for this post.
            </p>
          ) : (
            <>
              <CommentComposer postId={post._id} />
              {detail === undefined ? (
                <div className="pt-3">
                  <LoadingState label="Loading comments…" />
                </div>
              ) : comments.length === 0 ? (
                <p className="pt-3 text-caption text-ink-quiet">
                  No comments yet. Start the conversation.
                </p>
              ) : (
                <ul className="mt-4 grid gap-4">
                  {comments.map((c) => (
                    <li key={c._id}>
                      <CommentRow comment={c} postId={post._id} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

function CommentRow({
  comment,
  postId,
  isReply = false,
}: {
  comment: CommentNode | CommentItem;
  postId: Id<"posts">;
  isReply?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [replying, setReplying] = React.useState(false);
  const removeComment = useMutation(api.posts.removeComment);
  const replies = "replies" in comment ? comment.replies : [];

  async function doRemove() {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await removeComment({ commentId: comment._id });
      toastSuccess("Comment deleted.");
    } catch (err) {
      toastFailure(err, "Could not delete comment.");
    }
  }

  return (
    <div className={cn(isReply && "pl-7")}>
      <div className="flex items-start gap-2.5">
        <Avatar name={comment.authorName} url={comment.authorImageUrl} small />
        <div className="min-w-0 flex-1">
          <div className="rounded-md border border-hairline bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-body-strong text-ink-strong">
                {comment.authorName ?? "Unknown"}
              </span>
              <span className="text-caption text-ink-quiet">
                {relativeTime(comment._creationTime)}
                {comment.editedAt && " · edited"}
              </span>
            </div>
            {editing ? (
              <EditCommentForm
                comment={comment}
                onDone={() => setEditing(false)}
              />
            ) : (
              <p className="mt-0.5 whitespace-pre-wrap text-body text-ink">
                {comment.body}
              </p>
            )}
          </div>

          <div className="mt-1 flex items-center gap-3 pl-1">
            <ReactionBar
              postId={postId}
              commentId={comment._id}
              counts={comment.reactionCounts}
              myReaction={comment.myReaction}
              compact
            />
            {!isReply && (
              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                className="inline-flex items-center gap-1 text-caption text-ink-quiet hover:text-ink"
              >
                <CornerDownRight className="h-3 w-3" aria-hidden="true" />
                Reply
              </button>
            )}
            {comment.canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="text-caption text-ink-quiet hover:text-ink"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={doRemove}
                  className="text-caption text-ink-quiet hover:text-danger"
                >
                  Delete
                </button>
              </>
            )}
          </div>

          {replying && (
            <div className="mt-2">
              <CommentComposer
                postId={postId}
                parentCommentId={comment._id}
                placeholder="Write a reply…"
                onDone={() => setReplying(false)}
                autoFocus
              />
            </div>
          )}

          {replies.length > 0 && (
            <ul className="mt-3 grid gap-3">
              {replies.map((r) => (
                <li key={r._id}>
                  <CommentRow comment={r} postId={postId} isReply />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ReactionBar({
  postId,
  commentId,
  counts,
  myReaction,
  compact = false,
}: {
  postId: Id<"posts">;
  commentId?: Id<"postComments">;
  counts: ReactionCounts;
  myReaction: ReactionKind | null;
  compact?: boolean;
}) {
  const setReaction = useMutation(api.posts.setReaction);

  async function react(kind: ReactionKind) {
    const next = myReaction === kind ? null : kind;
    try {
      await setReaction({ postId, commentId, kind: next });
    } catch (err) {
      toastFailure(err, "Could not react.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {REACTIONS.map(({ kind, emoji, label }) => {
        const count = counts[kind];
        const mine = myReaction === kind;
        if (compact && count === 0 && !mine) {
          // In compact mode only show reactions that have activity, plus a
          // lightweight affordance to add the first one.
          return (
            <button
              key={kind}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => react(kind)}
              className="rounded-full px-1.5 py-0.5 text-caption text-ink-quiet/70 hover:bg-surface-sunk hover:text-ink"
            >
              <span aria-hidden="true" className="opacity-60">
                {emoji}
              </span>
            </button>
          );
        }
        return (
          <button
            key={kind}
            type="button"
            title={label}
            aria-label={`${label}${count ? ` (${count})` : ""}`}
            aria-pressed={mine}
            onClick={() => react(kind)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
              "text-caption transition-colors duration-fast ease-out",
              mine
                ? "border-primary bg-primary-wash text-ink-strong"
                : "border-hairline bg-surface text-ink-soft hover:bg-surface-sunk",
            )}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && <span data-numeric>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function CommentComposer({
  postId,
  parentCommentId,
  placeholder = "Write a comment…",
  onDone,
  autoFocus,
}: {
  postId: Id<"posts">;
  parentCommentId?: Id<"postComments">;
  placeholder?: string;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const addComment = useMutation(api.posts.addComment);
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await addComment({ postId, parentCommentId, body: trimmed });
      setBody("");
      onDone?.();
    } catch (err) {
      toastFailure(err, "Could not post comment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={2}
        autoFocus={autoFocus}
        className="min-h-[2.5rem]"
      />
      <Button type="submit" size="sm" disabled={saving || !body.trim()}>
        {saving ? "Posting…" : "Post"}
      </Button>
    </form>
  );
}

function EditPostForm({
  post,
  onDone,
}: {
  post: PostListItem;
  onDone: () => void;
}) {
  const update = useMutation(api.posts.update);
  const [title, setTitle] = React.useState(post.title ?? "");
  // Edits always upgrade the body to HTML; seed legacy plain posts as HTML.
  const [body, setBody] = React.useState(() =>
    post.bodyFormat === "html" ? post.body : plainToHtml(post.body),
  );
  const [saving, setSaving] = React.useState(false);
  const empty = isHtmlEmpty(body);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (empty) return;
    setSaving(true);
    try {
      await update({
        postId: post._id,
        title: title.trim() ? title.trim() : null,
        body,
        bodyFormat: "html",
      });
      toastSuccess("Post updated.");
      onDone();
    } catch (err) {
      toastFailure(err, "Could not update post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
      />
      <RichTextEditor value={body} onChange={setBody} ariaLabel="Post body" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving || empty}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EditCommentForm({
  comment,
  onDone,
}: {
  comment: CommentItem;
  onDone: () => void;
}) {
  const updateComment = useMutation(api.posts.updateComment);
  const [body, setBody] = React.useState(comment.body);
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      await updateComment({ commentId: comment._id, body: body.trim() });
      toastSuccess("Comment updated.");
      onDone();
    } catch (err) {
      toastFailure(err, "Could not update comment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-1 grid gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        autoFocus
        required
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving || !body.trim()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function NewPostDialog({
  teams,
}: {
  teams: { _id: Id<"teams">; name: string }[];
}) {
  const { hasCapability } = useGatherHub();
  const create = useMutation(api.posts.create);
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState("org");
  const [commentsDisabled, setCommentsDisabled] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const selectedTeamId =
    audience === "org" ? undefined : (audience as Id<"teams">);
  // Reactively reflect whether the caller may post to the chosen scope.
  const scopeAccess = useQuery(
    api.posts.myPostingAccess,
    selectedTeamId ? { teamId: selectedTeamId } : {},
  );
  const canModerate = hasCapability("posts.moderate");
  const canPostHere = scopeAccess?.canPost ?? true;

  function reset() {
    setTitle("");
    setBody("");
    setAudience("org");
    setCommentsDisabled(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isHtmlEmpty(body)) {
      setError("Write something to post.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await create({
        title: title.trim() || undefined,
        body,
        bodyFormat: "html",
        teamId: selectedTeamId,
        commentsDisabled,
      });
      reset();
      setOpen(false);
      toastSuccess("Posted.");
    } catch (err) {
      setError(toastFailure(err, "Could not create post."));
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
        <Button>
          <Plus className="h-4 w-4" />
          New post
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New post</DialogTitle>
          <DialogDescription>
            Share an update org-wide or with a specific team.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger>
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org">Org-wide</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!canPostHere && (
              <p className="text-caption text-danger">
                You don't have permission to post to this feed.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="post-title">Title (optional)</Label>
            <Input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="post-body">Message</Label>
            <RichTextEditor
              value={body}
              onChange={setBody}
              ariaLabel="Post message"
            />
          </div>
          {canModerate && (
            <label className="flex items-center gap-2 text-body text-ink-soft">
              <input
                type="checkbox"
                checked={commentsDisabled}
                onChange={(e) => setCommentsDisabled(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Turn off comments for this post
            </label>
          )}
          {error && <p className="text-caption text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={saving || !canPostHere}>
            {saving ? "Posting…" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Moderator control: let plain members create posts, org-wide or per team. */
function PostingSettingsDialog() {
  const teams = useQuery(api.teams.list, {});
  const orgAccess = useQuery(api.posts.myPostingAccess, {});
  const setMemberPosting = useMutation(api.posts.setMemberPosting);
  const [open, setOpen] = React.useState(false);

  async function toggle(teamId: Id<"teams"> | undefined, enabled: boolean) {
    try {
      await setMemberPosting({ teamId, enabled });
      toastSuccess(
        enabled ? "Members can post." : "Member posting turned off.",
      );
    } catch (err) {
      toastFailure(err, "Could not update posting settings.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Settings2 className="h-4 w-4" />
          Posting
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who can post</DialogTitle>
          <DialogDescription>
            Committee and admins can always post. Allow ordinary members to
            create posts org-wide or in specific team feeds.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2.5">
          <ToggleRow
            label="Org-wide feed"
            description="Members can post to everyone."
            checked={Boolean(orgAccess?.membersCanPost)}
            onChange={(v) => toggle(undefined, v)}
          />
          {(teams ?? []).map((t) => (
            <TeamPostingToggle
              key={t._id}
              teamId={t._id}
              name={t.name}
              onChange={(v) => toggle(t._id, v)}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamPostingToggle({
  teamId,
  name,
  onChange,
}: {
  teamId: Id<"teams">;
  name: string;
  onChange: (enabled: boolean) => void;
}) {
  const access = useQuery(api.posts.myPostingAccess, { teamId });
  return (
    <ToggleRow
      label={name}
      description="Members on this team can post to its feed."
      checked={Boolean(access?.membersCanPost)}
      onChange={onChange}
    />
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-md border border-hairline px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-body-strong text-ink-strong">{label}</span>
        <span className="block text-caption text-ink-quiet">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-primary shrink-0"
      />
    </label>
  );
}

function Avatar({
  name,
  url,
  small = false,
}: {
  name: string | null;
  url: string | null;
  small?: boolean;
}) {
  const size = small ? "h-7 w-7 text-caption" : "h-9 w-9 text-body";
  const initials = (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        className={cn("shrink-0 rounded-full object-cover", size)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        "bg-surface-sunk text-ink-soft font-semi",
        size,
      )}
    >
      {initials || "?"}
    </span>
  );
}
