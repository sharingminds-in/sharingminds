"use client";

import type { ReactNode } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Archive,
  Book,
  Calendar,
  CheckCircle2,
  Clock,
  Edit,
  ExternalLink,
  FileText,
  FolderArchive,
  Link,
  Loader2,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { MentorContent } from '@/hooks/queries/use-content-queries';

export type ContentActionKind = 'delete' | 'submit' | 'archive' | 'restore';

export type PendingContentAction = {
  id: string;
  kind: ContentActionKind;
  label: string;
} | null;

interface ContentDetailDialogProps {
  content: MentorContent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (content: MentorContent) => void;
  onDelete: (id: string) => void;
  onOpenCourse: (content: MentorContent) => void;
  onSubmitForReview: (id: string) => void;
  onArchive: (id: string, currentStatus: string) => void;
  onRestore: (id: string, statusBeforeArchive?: string) => void;
  actionsDisabled: boolean;
  pendingAction: PendingContentAction;
}

const statusConfig: Record<string, { label: string; className: string; icon: ReactNode }> = {
  APPROVED: {
    label: 'Approved',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  DRAFT: {
    label: 'Draft',
    className: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: <Edit className="h-3.5 w-3.5" />,
  },
  PENDING_REVIEW: {
    label: 'Pending Review',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  REJECTED: {
    label: 'Rejected',
    className: 'bg-red-50 text-red-700 border-red-200',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  ARCHIVED: {
    label: 'Archived',
    className: 'bg-gray-50 text-gray-600 border-gray-200',
    icon: <FolderArchive className="h-3.5 w-3.5" />,
  },
  FLAGGED: {
    label: 'Flagged',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
};

const typeConfig: Record<string, { label: string; className: string; icon: ReactNode }> = {
  COURSE: {
    label: 'Course',
    className: 'bg-violet-100 text-violet-700',
    icon: <Book className="h-5 w-5" />,
  },
  FILE: {
    label: 'File',
    className: 'bg-blue-100 text-blue-700',
    icon: <FileText className="h-5 w-5" />,
  },
  URL: {
    label: 'URL',
    className: 'bg-teal-100 text-teal-700',
    icon: <Link className="h-5 w-5" />,
  },
};

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not recorded';

  const date = new Date(value);
  return `${format(date, 'PPP p')} (${formatDistanceToNow(date, { addSuffix: true })})`;
}

function formatFileSize(size?: number | null) {
  if (!size) return 'Not recorded';
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function DetailField({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-white/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-1 text-sm font-medium text-gray-800 break-words">
        {value || 'Not recorded'}
      </div>
    </div>
  );
}

export function ContentDetailDialog({
  content,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onOpenCourse,
  onSubmitForReview,
  onArchive,
  onRestore,
  actionsDisabled,
  pendingAction,
}: ContentDetailDialogProps) {
  if (!content) return null;

  const status = statusConfig[content.status] || statusConfig.DRAFT;
  const type = typeConfig[content.type] || typeConfig.FILE;
  const canEdit = content.status === 'DRAFT' || content.status === 'REJECTED';
  const canSubmit = content.status === 'DRAFT' || content.status === 'REJECTED';
  const canArchive = content.status !== 'ARCHIVED' && content.status !== 'PENDING_REVIEW';
  const canRestore = content.status === 'ARCHIVED';
  const isPending = pendingAction?.id === content.id;
  const isPendingKind = (kind: ContentActionKind) => isPending && pendingAction?.kind === kind;

  const closeAndRun = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{content.title}</DialogTitle>
          <DialogDescription>Detailed content view for mentor content.</DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6 text-white">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="relative flex items-start gap-4 pr-8">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${type.className}`}>
              {type.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className={`gap-1 border ${status.className}`}>
                  {status.icon}
                  {status.label}
                </Badge>
                <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                  {type.label}
                </Badge>
              </div>
              <h2 className="text-2xl font-bold leading-tight tracking-tight">{content.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/80">
                {content.description || 'No description provided.'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {isPending && (
            <Alert className="border-blue-200 bg-blue-50">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <AlertDescription className="font-medium text-blue-700">
                {pendingAction?.label}
              </AlertDescription>
            </Alert>
          )}

          {content.status === 'REJECTED' && content.reviewNote && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">
                <span className="font-semibold">Admin feedback:</span> {content.reviewNote}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DetailField label="Created" value={formatDate(content.createdAt)} />
            <DetailField label="Last Updated" value={formatDate(content.updatedAt)} />
            <DetailField label="Submitted for Review" value={formatDate(content.submittedForReviewAt)} />
            <DetailField label="Reviewed" value={formatDate(content.reviewedAt)} />
          </div>

          <Card className="overflow-hidden border-dashed">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b bg-gray-50 px-4 py-3">
                <Calendar className="h-4 w-4 text-gray-500" />
                <h3 className="font-semibold text-gray-900">Resource Details</h3>
              </div>

              <div className="space-y-4 p-4">
                {content.type === 'URL' && (
                  <div className="space-y-3">
                    <DetailField label="Display Title" value={content.urlTitle || content.title} />
                    <DetailField label="URL Description" value={content.urlDescription || content.description} />
                    <DetailField
                      label="External Link"
                      value={
                        content.url ? (
                          <a
                            href={content.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline decoration-dotted underline-offset-4"
                          >
                            {content.url}
                          </a>
                        ) : null
                      }
                    />
                  </div>
                )}

                {content.type === 'FILE' && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <DetailField label="File Name" value={content.fileName} />
                    <DetailField label="File Size" value={formatFileSize(content.fileSize)} />
                    <DetailField label="MIME Type" value={content.mimeType} />
                    <DetailField
                      label="File URL"
                      value={
                        content.fileUrl ? (
                          <a
                            href={content.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline decoration-dotted underline-offset-4"
                          >
                            Open uploaded file
                          </a>
                        ) : null
                      }
                    />
                  </div>
                )}

                {content.type === 'COURSE' && (
                  <div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900">
                    Course modules, sections, and lessons are managed in the course builder.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {content.type === 'URL' && content.url && (
                <Button asChild variant="outline">
                  <a href={content.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open Link
                  </a>
                </Button>
              )}
              {content.type === 'FILE' && content.fileUrl && (
                <Button asChild variant="outline">
                  <a href={content.fileUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    View File
                  </a>
                </Button>
              )}
              {content.type === 'COURSE' && (
                <Button
                  variant="outline"
                  disabled={actionsDisabled}
                  onClick={() => closeAndRun(() => onOpenCourse(content))}
                >
                  <Book className="h-4 w-4" />
                  Manage Course
                </Button>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {canEdit && (
                <Button
                  variant="outline"
                  disabled={actionsDisabled}
                  onClick={() => closeAndRun(() => onEdit(content))}
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              )}
              {canSubmit && (
                <Button
                  variant="outline"
                  disabled={actionsDisabled}
                  onClick={() => closeAndRun(() => onSubmitForReview(content.id))}
                >
                  {isPendingKind('submit') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {content.status === 'REJECTED' ? 'Resubmit' : 'Submit'}
                </Button>
              )}
              {canArchive && (
                <Button
                  variant="outline"
                  disabled={actionsDisabled}
                  onClick={() => closeAndRun(() => onArchive(content.id, content.status))}
                >
                  {isPendingKind('archive') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                  Archive
                </Button>
              )}
              {canRestore && (
                <Button
                  variant="outline"
                  disabled={actionsDisabled}
                  onClick={() => closeAndRun(() => onRestore(content.id, content.statusBeforeArchive))}
                >
                  {isPendingKind('restore') ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Restore
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={actionsDisabled}
                onClick={() => closeAndRun(() => onDelete(content.id))}
              >
                {isPendingKind('delete') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
