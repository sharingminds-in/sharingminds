"use client";

import { format } from 'date-fns';
import {
  ExternalLink,
  FileText,
  Globe,
  Download,
  Link2,
  BookOpen,
  File,
  Image,
  Video,
  Music,
  FileSpreadsheet,
  Presentation,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface ContentItem {
  id: string;
  title: string;
  description?: string | null;
  type: 'COURSE' | 'FILE' | 'URL';
  displayOrder?: number;
  // FILE fields
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  fileUrl?: string | null;
  // URL fields
  url?: string | null;
  urlTitle?: string | null;
  urlDescription?: string | null;
}

interface ContentDetailDialogProps {
  item: ContentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getFileTypeInfo(mimeType?: string | null, fileName?: string | null) {
  if (!mimeType && !fileName) return { label: 'File', icon: File, color: 'text-slate-600' };

  const mime = mimeType?.toLowerCase() || '';
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return { label: 'Image', icon: Image, color: 'text-pink-600' };
  }
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return { label: 'Video', icon: Video, color: 'text-violet-600' };
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) {
    return { label: 'Audio', icon: Music, color: 'text-amber-600' };
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return { label: 'PDF Document', icon: FileText, color: 'text-red-600' };
  }
  if (mime.includes('spreadsheet') || mime.includes('excel') || ['xlsx', 'xls', 'csv'].includes(ext)) {
    return { label: 'Spreadsheet', icon: FileSpreadsheet, color: 'text-emerald-600' };
  }
  if (mime.includes('presentation') || mime.includes('powerpoint') || ['pptx', 'ppt'].includes(ext)) {
    return { label: 'Presentation', icon: Presentation, color: 'text-orange-600' };
  }
  if (mime.includes('word') || mime.includes('document') || ['docx', 'doc'].includes(ext)) {
    return { label: 'Document', icon: FileText, color: 'text-blue-600' };
  }

  return { label: 'File', icon: File, color: 'text-slate-600' };
}

function getDomainFromUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function FileContentDetail({ item }: { item: ContentItem }) {
  const fileType = getFileTypeInfo(item.mimeType, item.fileName);
  const FileIcon = fileType.icon;

  return (
    <div className="space-y-6">
      {/* File hero card */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/20 p-6">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-200/30 blur-2xl dark:bg-emerald-800/20" />
        <div className="relative flex items-start gap-5">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
            "bg-white dark:bg-emerald-900/40 border border-emerald-100 dark:border-emerald-800/40"
          )}>
            <FileIcon className={cn("w-7 h-7", fileType.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="outline" className="bg-emerald-100/80 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800/40 text-xs">
                {fileType.label}
              </Badge>
              {item.fileSize && (
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(item.fileSize)}
                </span>
              )}
            </div>
            {item.fileName && (
              <p className="text-sm text-muted-foreground font-mono truncate mt-1">
                {item.fileName}
              </p>
            )}
            {item.mimeType && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">{item.mimeType}</p>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {item.description && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Description
          </h4>
          <p className="text-sm text-foreground leading-relaxed">
            {item.description}
          </p>
        </div>
      )}

      {/* Action */}
      {item.fileUrl && (
        <>
          <Separator />
          <div className="flex justify-end">
            <Button asChild>
              <a
                href={item.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="w-4 h-4 mr-2" />
                View / Download File
              </a>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function UrlContentDetail({ item }: { item: ContentItem }) {
  const domain = getDomainFromUrl(item.url);

  return (
    <div className="space-y-6">
      {/* URL hero card */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-50 to-blue-50/50 dark:from-sky-950/30 dark:to-blue-950/20 p-6">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-sky-200/30 blur-2xl dark:bg-sky-800/20" />
        <div className="relative flex items-start gap-5">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
            "bg-white dark:bg-sky-900/40 border border-sky-100 dark:border-sky-800/40"
          )}>
            <Globe className="w-7 h-7 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            {item.urlTitle && (
              <p className="font-semibold text-foreground mb-1">
                {item.urlTitle}
              </p>
            )}
            {item.urlDescription && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {item.urlDescription}
              </p>
            )}
            {domain && (
              <div className="flex items-center gap-1.5 mt-2">
                <Link2 className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground font-mono">
                  {domain}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* URL display */}
      {item.url && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Resource URL
          </h4>
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-sm text-blue-600 dark:text-blue-400 break-all font-mono">
              {item.url}
            </p>
          </div>
        </div>
      )}

      {/* Description */}
      {item.description && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Description
          </h4>
          <p className="text-sm text-foreground leading-relaxed">
            {item.description}
          </p>
        </div>
      )}

      {/* Action */}
      {item.url && (
        <>
          <Separator />
          <div className="flex justify-end">
            <Button asChild>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Link
              </a>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function ContentDetailDialog({
  item,
  open,
  onOpenChange,
}: ContentDetailDialogProps) {
  if (!item) return null;

  const typeConfig = {
    FILE: {
      label: 'File',
      icon: FileText,
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/30',
    },
    URL: {
      label: 'Link',
      icon: Globe,
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-900/30',
    },
    COURSE: {
      label: 'Course',
      icon: BookOpen,
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-900/30',
    },
  };

  const config = typeConfig[item.type] || typeConfig.FILE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={cn('text-xs border', config.badgeClass)}>
              {config.label}
            </Badge>
          </div>
          <DialogTitle className="text-xl leading-tight">
            {item.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detailed view of {item.type.toLowerCase()} content: {item.title}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {item.type === 'FILE' && <FileContentDetail item={item} />}
          {item.type === 'URL' && <UrlContentDetail item={item} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
