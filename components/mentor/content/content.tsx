"use client";

import { useState, useMemo, useCallback, memo } from 'react';
import { Plus, Book, FileText, Link, Edit, Trash2, Upload, Send, Archive, RotateCcw, AlertCircle, Clock, CheckCircle2, XCircle, FolderArchive, LayoutGrid, Eye, Globe } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useContentList, useDeleteContent, useSubmitForReview, useArchiveContent, MentorContent as ContentType } from '@/hooks/queries/use-content-queries';
import { CreateContentDialog } from './create-content-dialog';
import { EditContentDialog } from './edit-content-dialog';
import { CourseBuilder } from './course-builder';
import { ProfileContentSelector } from './profile-content-selector';
import { MentorContentErrorBoundary, useMentorContentErrorHandler } from './mentor-content-error-boundary';
import { formatDistanceToNow } from 'date-fns';

type ConfirmAction = {
  title: string;
  description: string;
  actionLabel: string;
  variant: 'default' | 'destructive';
  onConfirm: () => void;
} | null;

const statusConfig: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode; label: string }> = {
  APPROVED: { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-l-emerald-500', icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Approved' },
  DRAFT: { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-l-slate-400', icon: <Edit className="h-3.5 w-3.5" />, label: 'Draft' },
  PENDING_REVIEW: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-l-amber-500', icon: <Clock className="h-3.5 w-3.5" />, label: 'Pending Review' },
  REJECTED: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-l-red-500', icon: <XCircle className="h-3.5 w-3.5" />, label: 'Rejected' },
  ARCHIVED: { color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-l-gray-400', icon: <FolderArchive className="h-3.5 w-3.5" />, label: 'Archived' },
  FLAGGED: { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-l-orange-500', icon: <AlertCircle className="h-3.5 w-3.5" />, label: 'Flagged' },
};

const typeConfig: Record<string, { icon: React.ReactNode; bg: string; label: string }> = {
  COURSE: { icon: <Book className="h-5 w-5 text-violet-600" />, bg: 'bg-violet-100', label: 'Course' },
  FILE: { icon: <FileText className="h-5 w-5 text-blue-600" />, bg: 'bg-blue-100', label: 'File' },
  URL: { icon: <Link className="h-5 w-5 text-teal-600" />, bg: 'bg-teal-100', label: 'URL' },
};

const filterTabs = [
  { key: 'all', label: 'All', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { key: 'pending', label: 'Pending', icon: <Clock className="h-3.5 w-3.5" /> },
  { key: 'approved', label: 'Approved', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  { key: 'rejected', label: 'Rejected', icon: <XCircle className="h-3.5 w-3.5" /> },
  { key: 'archived', label: 'Archived', icon: <FolderArchive className="h-3.5 w-3.5" /> },
];

interface ContentCardProps {
  content: ContentType;
  onEdit: (content: ContentType) => void;
  onDelete: (id: string) => void;
  onOpenCourse: (content: ContentType) => void;
  onSubmitForReview: (id: string) => void;
  onArchive: (id: string, currentStatus: string) => void;
  onRestore: (id: string, statusBeforeArchive?: string) => void;
}

const ContentCard = memo(({ content, onEdit, onDelete, onOpenCourse, onSubmitForReview, onArchive, onRestore }: ContentCardProps) => {
  const formattedDate = useMemo(() =>
    formatDistanceToNow(new Date(content.updatedAt), { addSuffix: true }),
    [content.updatedAt]
  );

  const status = statusConfig[content.status] || statusConfig.DRAFT;
  const type = typeConfig[content.type] || typeConfig.FILE;
  const canEdit = content.status === 'DRAFT' || content.status === 'REJECTED';
  const canSubmit = content.status === 'DRAFT' || content.status === 'REJECTED';
  const canArchive = content.status !== 'ARCHIVED' && content.status !== 'PENDING_REVIEW';
  const canRestore = content.status === 'ARCHIVED';

  return (
    <Card className={`group relative overflow-hidden border-l-4 ${status.border} hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5`}>
      <CardContent className="p-0">
        {/* Card Body */}
        <div className="p-5">
          {/* Top Row: Icon + Title + Status */}
          <div className="flex items-start gap-3.5">
            <div className={`flex-shrink-0 h-11 w-11 rounded-xl ${type.bg} flex items-center justify-center shadow-sm`}>
              {type.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-white text-[15px] leading-tight truncate">
                  {content.title}
                </h3>
                <Badge className={`flex-shrink-0 ${status.bg} ${status.color} border-0 gap-1 text-[11px] font-medium px-2 py-0.5`}>
                  {status.icon}
                  {status.label}
                </Badge>
              </div>
              {content.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {content.description}
                </p>
              )}
            </div>
          </div>

          {/* Rejection Banner */}
          {content.status === 'REJECTED' && content.reviewNote && (
            <Alert className="mt-3 border-red-200 bg-red-50/80 py-2.5 px-3">
              <AlertCircle className="h-3.5 w-3.5 text-red-600" />
              <AlertDescription className="text-xs text-red-700">
                <span className="font-semibold">Feedback:</span> {content.reviewNote}
              </AlertDescription>
            </Alert>
          )}

          {/* Meta Row */}
          <div className="flex items-center gap-3 mt-3.5 text-xs text-gray-400 dark:text-gray-500">
            <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 h-5 gap-1 border-gray-200">
              {type.icon && <span className="scale-75">{type.icon}</span>}
              {type.label}
            </Badge>
            {content.type === 'FILE' && content.fileName && (
              <span className="truncate max-w-[180px]" title={content.fileName}>
                {content.fileName}
                {content.fileSize && ` (${(content.fileSize / 1024 / 1024).toFixed(2)} MB)`}
              </span>
            )}
            {content.type === 'URL' && content.url && (
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 truncate max-w-[200px] underline decoration-dotted underline-offset-2"
              >
                {content.urlTitle || content.url}
              </a>
            )}
            <span className="ml-auto flex-shrink-0">{formattedDate}</span>
          </div>
        </div>

        {/* Action Bar — visible on hover */}
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50 px-4 py-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 max-h-0 group-hover:max-h-20 overflow-hidden group-hover:py-2.5">
          {canEdit && (
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50" onClick={() => onEdit(content)}>
              <Edit className="h-3 w-3" /> Edit
            </Button>
          )}
          {content.type === 'COURSE' && (
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5 text-gray-600 hover:text-violet-600 hover:bg-violet-50" onClick={() => onOpenCourse(content)}>
              <Eye className="h-3 w-3" /> Manage
            </Button>
          )}
          {canSubmit && (
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5 text-gray-600 hover:text-amber-600 hover:bg-amber-50" onClick={() => onSubmitForReview(content.id)}>
              <Send className="h-3 w-3" /> {content.status === 'REJECTED' ? 'Resubmit' : 'Submit'}
            </Button>
          )}
          {canArchive && (
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100" onClick={() => onArchive(content.id, content.status)}>
              <Archive className="h-3 w-3" /> Archive
            </Button>
          )}
          {canRestore && (
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50" onClick={() => onRestore(content.id, content.statusBeforeArchive)}>
              <RotateCcw className="h-3 w-3" /> Restore
            </Button>
          )}
          <div className="ml-auto">
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(content.id)}>
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

function StatsBar({ content }: { content: ContentType[] }) {
  const counts = useMemo(() => ({
    total: content.filter(i => i.status !== 'ARCHIVED').length,
    approved: content.filter(i => i.status === 'APPROVED').length,
    pending: content.filter(i => i.status === 'PENDING_REVIEW').length,
    draft: content.filter(i => i.status === 'DRAFT').length,
    rejected: content.filter(i => i.status === 'REJECTED').length,
  }), [content]);

  const stats = [
    { label: 'Total', value: counts.total, color: 'from-blue-500 to-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300' },
    { label: 'Approved', value: counts.approved, color: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'Pending', value: counts.pending, color: 'from-amber-500 to-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300' },
    { label: 'Drafts', value: counts.draft, color: 'from-slate-400 to-slate-500', bg: 'bg-slate-50 dark:bg-slate-950/30', text: 'text-slate-600 dark:text-slate-300' },
    { label: 'Rejected', value: counts.rejected, color: 'from-red-500 to-red-600', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map(s => (
        <div key={s.label} className={`${s.bg} rounded-xl p-3.5 border border-white/60 dark:border-gray-800`}>
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{s.label}</p>
          <p className={`text-2xl font-bold ${s.text} mt-0.5`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

export const MentorContent = memo(() => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<ContentType | null>(null);
  const [courseBuilderContent, setCourseBuilderContent] = useState<ContentType | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [profileSelectorOpen, setProfileSelectorOpen] = useState(false);

  const { data: content = [], isLoading } = useContentList();
  const deleteContentMutation = useDeleteContent();
  const submitForReviewMutation = useSubmitForReview();
  const archiveContentMutation = useArchiveContent();
  const { handleError } = useMentorContentErrorHandler();

  const handleEdit = useCallback((content: ContentType) => {
    try { setEditingContent(content); } catch (error) { handleError(error as Error, 'content-edit'); }
  }, [handleError]);

  const handleDelete = useCallback((id: string) => {
    setConfirmAction({
      title: 'Delete Content',
      description: 'Are you sure you want to delete this content? It will be retained for 30 days before permanent purge.',
      actionLabel: 'Delete',
      variant: 'destructive',
      onConfirm: () => {
        try { deleteContentMutation.mutate(id); } catch (error) { handleError(error as Error, 'content-delete'); }
      },
    });
  }, [deleteContentMutation, handleError]);

  const handleOpenCourse = useCallback((content: ContentType) => {
    try { setCourseBuilderContent(content); } catch (error) { handleError(error as Error, 'course-builder-open'); }
  }, [handleError]);

  const handleSubmitForReview = useCallback((id: string) => {
    setConfirmAction({
      title: 'Submit for Review',
      description: 'Submit this content for admin review? You won\'t be able to edit it while it\'s under review.',
      actionLabel: 'Submit',
      variant: 'default',
      onConfirm: () => submitForReviewMutation.mutate(id),
    });
  }, [submitForReviewMutation]);

  const handleArchive = useCallback((id: string, currentStatus: string) => {
    setConfirmAction({
      title: 'Archive Content',
      description: 'Archive this content? It will be hidden from your profile but can be restored later.',
      actionLabel: 'Archive',
      variant: 'default',
      onConfirm: () => archiveContentMutation.mutate({ id, action: 'archive', statusBeforeArchive: currentStatus }),
    });
  }, [archiveContentMutation]);

  const handleRestore = useCallback((id: string, statusBeforeArchive?: string) => {
    archiveContentMutation.mutate({ id, action: 'restore', statusBeforeArchive });
  }, [archiveContentMutation]);

  const handleCreateDialogOpen = useCallback(() => setCreateDialogOpen(true), []);
  const handleCreateDialogClose = useCallback(() => setCreateDialogOpen(false), []);
  const handleEditDialogClose = useCallback(() => setEditingContent(null), []);
  const handleCourseBuilderBack = useCallback(() => setCourseBuilderContent(null), []);

  const filteredContent = useMemo(() => {
    return content.filter((item: ContentType) => {
      if (activeTab === 'all') return item.status !== 'ARCHIVED';
      if (activeTab === 'pending') return item.status === 'PENDING_REVIEW';
      if (activeTab === 'approved') return item.status === 'APPROVED';
      if (activeTab === 'rejected') return item.status === 'REJECTED';
      if (activeTab === 'archived') return item.status === 'ARCHIVED';
      return item.type === activeTab.toUpperCase();
    });
  }, [content, activeTab]);

  const tabCounts = useMemo(() => ({
    all: content.filter((item: ContentType) => item.status !== 'ARCHIVED').length,
    pending: content.filter((item: ContentType) => item.status === 'PENDING_REVIEW').length,
    approved: content.filter((item: ContentType) => item.status === 'APPROVED').length,
    rejected: content.filter((item: ContentType) => item.status === 'REJECTED').length,
    archived: content.filter((item: ContentType) => item.status === 'ARCHIVED').length,
  }), [content]);

  if (courseBuilderContent) {
    return (
      <MentorContentErrorBoundary context="course-builder">
        <CourseBuilder content={courseBuilderContent} onBack={handleCourseBuilderBack} />
      </MentorContentErrorBoundary>
    );
  }

  return (
    <MentorContentErrorBoundary context="content-list">
      <div className="space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6 sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">My Content</h1>
              <p className="text-blue-200/70 text-sm mt-1.5">Create and manage learning materials for your mentees</p>
            </div>
            <div className="flex items-center gap-2">
              {tabCounts.approved > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setProfileSelectorOpen(true)}
                  className="border-blue-400/30 text-blue-200 hover:bg-blue-500/20 hover:text-white transition-all h-10 px-4 gap-2 rounded-xl font-medium bg-white/5 backdrop-blur-sm"
                >
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline">Manage Profile</span>
                </Button>
              )}
              <Button
                onClick={handleCreateDialogOpen}
                className="bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-400/30 transition-all h-10 px-5 gap-2 rounded-xl font-medium"
              >
                <Plus className="h-4 w-4" />
                Create Content
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <StatsBar content={content} />

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {filterTabs.map(tab => {
            const count = tabCounts[tab.key as keyof typeof tabCounts] ?? 0;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                }`}
              >
                {tab.icon}
                {tab.label}
                {count > 0 && (
                  <span className={`text-[10px] font-semibold min-w-[18px] h-[18px] flex items-center justify-center rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse border-l-4 border-l-gray-200">
                <CardContent className="p-5">
                  <div className="flex gap-3.5">
                    <div className="h-11 w-11 rounded-xl bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded-full w-16" />
                    <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded-full w-12" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredContent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
              <Upload className="h-7 w-7 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1.5">
              {activeTab === 'all' ? 'No content yet' : `No ${activeTab} content`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm mb-5">
              {activeTab === 'all'
                ? 'Start creating content to share with your mentees. Courses, files, and links are supported.'
                : activeTab === 'rejected'
                ? 'No rejected content — great job!'
                : activeTab === 'pending'
                ? 'No content pending review right now.'
                : activeTab === 'archived'
                ? 'No archived content.'
                : 'No approved content yet. Submit content for admin review to get it approved.'
              }
            </p>
            {activeTab === 'all' && (
              <Button onClick={handleCreateDialogOpen} className="gap-2 rounded-xl bg-blue-500 hover:bg-blue-400 shadow-md">
                <Plus className="h-4 w-4" />
                Create Your First Content
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredContent.map((item: ContentType) => (
              <ContentCard
                key={item.id}
                content={item}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onOpenCourse={handleOpenCourse}
                onSubmitForReview={handleSubmitForReview}
                onArchive={handleArchive}
                onRestore={handleRestore}
              />
            ))}
          </div>
        )}

        {editingContent && (
          <EditContentDialog
            content={editingContent}
            open={!!editingContent}
            onOpenChange={handleEditDialogClose}
          />
        )}

        <CreateContentDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSuccess={handleCreateDialogClose}
        />

        <ProfileContentSelector
          open={profileSelectorOpen}
          onOpenChange={setProfileSelectorOpen}
        />

        {/* Confirmation Dialog */}
        <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={confirmAction?.variant === 'destructive' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
                onClick={() => {
                  confirmAction?.onConfirm();
                  setConfirmAction(null);
                }}
              >
                {confirmAction?.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MentorContentErrorBoundary>
  );
});
