"use client";

import type { ReactNode } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Archive,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  Flag,
  Globe,
  History,
  Loader2,
  RotateCw,
  ShieldAlert,
  Trash2,
  User,
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  useAdminContentDetailQuery,
  type AdminContentAction,
  type AdminContentDetail,
  type AdminContentItem,
} from '@/hooks/queries/use-admin-content-queries';

export type PendingAdminContentAction = {
  id: string;
  action: AdminContentAction;
  label: string;
} | null;

interface AdminContentDetailDialogProps {
  item: AdminContentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (id: string, action: AdminContentAction) => void;
  actionsDisabled: boolean;
  pendingAction: PendingAdminContentAction;
}

const statusBadgeConfig: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-800 border-slate-200' },
  PENDING_REVIEW: { label: 'Pending Review', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  APPROVED: { label: 'Approved', className: 'bg-green-100 text-green-800 border-green-200' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
  ARCHIVED: { label: 'Archived', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  FLAGGED: { label: 'Flagged', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  DELETED: { label: 'Deleted', className: 'bg-red-100 text-red-800 border-red-200' },
};

const actionLabels: Record<AdminContentAction, string> = {
  APPROVE: 'Approve',
  REJECT: 'Reject',
  FLAG: 'Flag',
  UNFLAG: 'Unflag',
  FORCE_APPROVE: 'Force Approve',
  FORCE_ARCHIVE: 'Force Archive',
  REVOKE_APPROVAL: 'Revoke Approval',
  FORCE_DELETE: 'Delete',
};

const actionIcons: Partial<Record<AdminContentAction, typeof CheckCircle2>> = {
  APPROVE: CheckCircle2,
  REJECT: XCircle,
  FORCE_APPROVE: CheckCircle2,
  REVOKE_APPROVAL: XCircle,
  FLAG: Flag,
  UNFLAG: RotateCw,
  FORCE_ARCHIVE: Archive,
  FORCE_DELETE: Trash2,
};

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not recorded';

  const date = new Date(value);
  return `${format(date, 'PPP p')} (${formatDistanceToNow(date, { addSuffix: true })})`;
}

function formatFileSize(size?: number | null) {
  if (!size) return 'Not recorded';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getAllowedActions(status: string, isDeleted = false): AdminContentAction[] {
  if (isDeleted) {
    return [];
  }

  const actions: AdminContentAction[] = [];

  if (status === 'PENDING_REVIEW') {
    actions.push('APPROVE', 'REJECT');
  }

  if (['DRAFT', 'REJECTED', 'FLAGGED', 'ARCHIVED'].includes(status)) {
    actions.push('FORCE_APPROVE');
  }

  if (status === 'APPROVED') {
    actions.push('REVOKE_APPROVAL');
  }

  if (['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'].includes(status)) {
    actions.push('FLAG');
  }

  if (status === 'FLAGGED') {
    actions.push('UNFLAG');
  }

  if (['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FLAGGED'].includes(status)) {
    actions.push('FORCE_ARCHIVE');
  }

  actions.push('FORCE_DELETE');
  return actions;
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 break-words text-sm font-medium text-foreground">
        {value || 'Not recorded'}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5 p-6">
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-44 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function ResourceDetails({ detail }: { detail: AdminContentDetail }) {
  const { content } = detail;

  if (content.type === 'URL') {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <DetailField label="URL" value={content.url} />
        <DetailField label="Display Title" value={content.urlTitle} />
        <DetailField label="URL Description" value={content.urlDescription} />
        <DetailField
          label="Open Resource"
          value={
            content.url ? (
              <a
                className="inline-flex items-center gap-1 text-blue-600 underline decoration-dotted underline-offset-4"
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit external link
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null
          }
        />
      </div>
    );
  }

  if (content.type === 'FILE') {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <DetailField label="File Name" value={content.fileName} />
        <DetailField label="File Size" value={formatFileSize(content.fileSize)} />
        <DetailField label="MIME Type" value={content.mimeType} />
        <DetailField
          label="File"
          value={
            content.fileUrl ? (
              <a
                className="inline-flex items-center gap-1 text-blue-600 underline decoration-dotted underline-offset-4"
                href={content.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open uploaded file
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null
          }
        />
      </div>
    );
  }

  const course = 'course' in content ? content.course : null;
  const moduleCount = course?.modules?.length ?? 0;
  const sectionCount =
    course?.modules?.reduce((total, module) => total + module.sections.length, 0) ?? 0;
  const itemCount =
    course?.modules?.reduce(
      (total, module) =>
        total +
        module.sections.reduce(
          (sectionTotal, section) => sectionTotal + section.contentItems.length,
          0
        ),
      0
    ) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <DetailField label="Difficulty" value={course?.difficulty} />
        <DetailField label="Duration" value={course?.duration ? `${course.duration} min` : null} />
        <DetailField label="Category" value={course?.category} />
        <DetailField label="Enrollment Count" value={course?.enrollmentCount ?? 0} />
        <DetailField label="Modules" value={moduleCount} />
        <DetailField label="Sections" value={sectionCount} />
        <DetailField label="Lessons / Items" value={itemCount} />
        <DetailField
          label="Price"
          value={course?.price ? `${course.currency ?? 'USD'} ${course.price}` : 'Free / Not set'}
        />
      </div>

      {course?.modules?.length ? (
        <div className="space-y-3">
          {course.modules.map((module) => (
            <div key={module.id} className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{module.title}</p>
                  {module.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                  )}
                </div>
                <Badge variant="outline">{module.sections.length} sections</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {module.sections.map((section) => (
                  <div key={section.id} className="rounded-lg bg-white p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{section.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {section.contentItems.length} items
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No course curriculum has been added yet.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function AdminContentDetailDialog({
  item,
  open,
  onOpenChange,
  onAction,
  actionsDisabled,
  pendingAction,
}: AdminContentDetailDialogProps) {
  const contentId = item?.content.id ?? null;
  const detailQuery = useAdminContentDetailQuery(contentId, open);
  const detail = detailQuery.data?.data;
  const content = detail?.content ?? item?.content;
  const statusConfig = content
    ? content.deletedAt
      ? statusBadgeConfig.DELETED
      : statusBadgeConfig[content.status] ?? {
        label: content.status,
        className: 'bg-muted text-muted-foreground border-border',
      }
    : null;
  const allowedActions = content
    ? getAllowedActions(content.status, Boolean(content.deletedAt))
    : [];
  const isPendingForContent = Boolean(
    content && pendingAction?.id === content.id
  );

  const runAction = (action: AdminContentAction) => {
    if (!content || actionsDisabled) return;
    onAction(content.id, action);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{content?.title ?? 'Content Details'}</DialogTitle>
          <DialogDescription>
            Full administrative content detail, review state, resource metadata, and action controls.
          </DialogDescription>
        </DialogHeader>

        {!content ? (
          <DetailSkeleton />
        ) : (
          <>
            <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,#1d4ed8,transparent_34%),linear-gradient(135deg,#020617,#111827_45%,#0f172a)] p-6 text-white">
              <div className="absolute -right-12 top-6 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {statusConfig && (
                      <Badge variant="outline" className={statusConfig.className}>
                        {statusConfig.label}
                      </Badge>
                    )}
                    <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                      {content.type}
                    </Badge>
                    {content.deletedAt && (
                      <Badge variant="outline" className="border-red-200 bg-red-100 text-red-700">
                        Pending Purge
                      </Badge>
                    )}
                  </div>
                  <h2 className="max-w-3xl text-2xl font-bold tracking-tight">
                    {content.title}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
                    {content.description || 'No description provided.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 border border-white/20">
                      <AvatarImage src={detail?.mentorImage || item?.mentorImage || undefined} />
                      <AvatarFallback className="bg-white/15 text-white">
                        {(detail?.mentorName || item?.mentorName || 'M').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold">
                        {detail?.mentorName || item?.mentorName || 'Unknown mentor'}
                      </p>
                      <p className="text-xs text-slate-300">
                        {detail?.mentorEmail || item?.mentorEmail || 'No email recorded'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {detailQuery.isLoading && <DetailSkeleton />}

            {detailQuery.isError && (
              <div className="p-6">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Failed to load full content detail. The row summary is still available.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <div className="space-y-5 p-6">
              {isPendingForContent && (
                <Alert className="border-blue-200 bg-blue-50">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <AlertDescription className="font-medium text-blue-700">
                    {pendingAction?.label}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CalendarDays className="h-4 w-4 text-blue-600" />
                      Review Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <DetailField label="Created" value={formatDate(content.createdAt)} />
                    <DetailField label="Last Updated" value={formatDate(content.updatedAt)} />
                    <DetailField
                      label="Submitted"
                      value={formatDate(content.submittedForReviewAt)}
                    />
                    <DetailField label="Reviewed" value={formatDate(content.reviewedAt)} />
                    <DetailField label="Deleted" value={formatDate(content.deletedAt)} />
                    <DetailField label="Reviewer ID" value={content.reviewedBy} />
                    <DetailField label="Previous Status" value={content.statusBeforeArchive} />
                    <DetailField
                      label="Requires Review After Restore"
                      value={content.requireReviewAfterRestore ? 'Yes' : 'No'}
                    />
                    <DetailField label="Purge After" value={formatDate(content.purgeAfterAt)} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <User className="h-4 w-4 text-blue-600" />
                      Mentor Context
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <DetailField label="Mentor Name" value={detail?.mentorName || item?.mentorName} />
                    <DetailField label="Mentor Email" value={detail?.mentorEmail || item?.mentorEmail} />
                    <DetailField label="Mentor ID" value={content.mentorId} />
                    <DetailField label="Content ID" value={content.id} />
                  </CardContent>
                </Card>
              </div>

              {(content.reviewNote || content.flagReason || content.deleteReason) && (
                <div className="grid gap-3 md:grid-cols-3">
                  {content.reviewNote && (
                    <Alert className="border-red-200 bg-red-50">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-700">
                        <span className="font-semibold">Review note:</span> {content.reviewNote}
                      </AlertDescription>
                    </Alert>
                  )}
                  {content.flagReason && (
                    <Alert className="border-rose-200 bg-rose-50">
                      <ShieldAlert className="h-4 w-4 text-rose-600" />
                      <AlertDescription className="text-rose-700">
                        <span className="font-semibold">Flag reason:</span> {content.flagReason}
                      </AlertDescription>
                    </Alert>
                  )}
                  {content.deleteReason && (
                    <Alert className="border-slate-200 bg-slate-50">
                      <Trash2 className="h-4 w-4 text-slate-600" />
                      <AlertDescription>
                        <span className="font-semibold">Delete reason:</span> {content.deleteReason}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {content.type === 'URL' ? (
                      <Globe className="h-4 w-4 text-blue-600" />
                    ) : content.type === 'COURSE' ? (
                      <BookOpen className="h-4 w-4 text-blue-600" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-600" />
                    )}
                    Resource Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {detail ? (
                    <ResourceDetails detail={detail} />
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Loading full resource metadata...
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4 text-blue-600" />
                    Review Audit
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {detail?.reviewAudit?.length ? (
                    <div className="space-y-3">
                      {detail.reviewAudit.map((audit) => (
                        <div key={audit.id} className="rounded-xl border bg-muted/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge variant="outline">{audit.action}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(audit.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm">
                            {audit.previousStatus || 'None'} {'->'} {audit.newStatus}
                          </p>
                          {audit.note && (
                            <p className="mt-1 text-sm text-muted-foreground">{audit.note}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No review audit entries recorded yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Separator />

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-muted-foreground">
                  Admin actions are status-aware and locked while another action is processing.
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {allowedActions.length === 0 && content.deletedAt && (
                    <Alert className="border-red-200 bg-red-50">
                      <Trash2 className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-700">
                        This content is deleted and pending purge. Review actions are locked.
                      </AlertDescription>
                    </Alert>
                  )}
                  {allowedActions.map((action) => {
                    const Icon = actionIcons[action] ?? CheckCircle2;
                    const isCurrentPending =
                      pendingAction?.id === content.id && pendingAction.action === action;
                    const isDestructive = ['REJECT', 'FLAG', 'REVOKE_APPROVAL', 'FORCE_DELETE'].includes(action);

                    return (
                      <Button
                        key={action}
                        variant={isDestructive ? 'destructive' : 'outline'}
                        disabled={actionsDisabled}
                        onClick={() => runAction(action)}
                      >
                        {isCurrentPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                        {actionLabels[action]}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
