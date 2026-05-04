"use client";

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Book, FileText, Link as LinkIcon, Save, Check, X, Globe } from 'lucide-react';
import {
  useContentList,
  useProfileContentList,
  useUpdateProfileContent,
  type MentorContent,
} from '@/hooks/queries/use-content-queries';

const typeConfig: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  COURSE: { icon: <Book className="h-6 w-6" />, color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/30', label: 'Course' },
  FILE: { icon: <FileText className="h-6 w-6" />, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', label: 'File' },
  URL: { icon: <LinkIcon className="h-6 w-6" />, color: 'text-teal-600', bg: 'bg-teal-100 dark:bg-teal-900/30', label: 'Link' },
};

interface ProfileContentSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileContentSelector({ open, onOpenChange }: ProfileContentSelectorProps) {
  const { data: content = [], isLoading: loadingContent } = useContentList();
  const { data: profileContent = [], isLoading: loadingProfile } = useProfileContentList();
  const updateMutation = useUpdateProfileContent();

  const approvedContent = useMemo(
    () => content.filter((item) => item.status === 'APPROVED'),
    [content]
  );

  const savedIds = useMemo(() => {
    return new Set(profileContent.map(item => item.id));
  }, [profileContent]);

  const savedIdsKey = useMemo(() => {
    return [...savedIds].sort().join(',');
  }, [savedIds]);

  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(savedIds);

  // Sync local state when profile data loads or dialog opens
  useEffect(() => {
    setLocalSelectedIds(new Set(savedIdsKey.split(',').filter(Boolean)));
  }, [savedIdsKey, open]);

  const hasChanges = useMemo(() => {
    if (localSelectedIds.size !== savedIds.size) return true;
    for (const id of localSelectedIds) {
      if (!savedIds.has(id)) return true;
    }
    return false;
  }, [localSelectedIds, savedIds]);

  const toggleItem = useCallback((id: string) => {
    setLocalSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    const orderedIds = approvedContent
      .filter(item => localSelectedIds.has(item.id))
      .map(item => item.id);

    updateMutation.mutate(orderedIds, {
      onSuccess: () => onOpenChange(false),
    });
  }, [approvedContent, localSelectedIds, updateMutation, onOpenChange]);

  const handleDiscard = useCallback(() => {
    setLocalSelectedIds(new Set(savedIdsKey.split(',').filter(Boolean)));
  }, [savedIdsKey]);

  const handleClose = useCallback(() => {
    // Reset to saved state on close
    setLocalSelectedIds(new Set(savedIdsKey.split(',').filter(Boolean)));
    onOpenChange(false);
  }, [savedIdsKey, onOpenChange]);

  const isLoading = loadingContent || loadingProfile;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-blue-600" />
            Manage Profile Content
          </DialogTitle>
          <DialogDescription>
            Choose which approved content to showcase on your public mentor profile. Mentees will see these on your profile page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 -mx-1 px-1">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-700 p-4 h-36">
                  <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-xl mb-3" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : approvedContent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <FileText className="h-7 w-7 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No approved content yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs">
                Submit your content for admin review first. Once approved, you can select items to display on your profile.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {localSelectedIds.size} of {approvedContent.length} selected
                </p>
                {localSelectedIds.size > 0 && (
                  <button
                    onClick={() => setLocalSelectedIds(new Set())}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline decoration-dotted underline-offset-2"
                  >
                    Deselect all
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {approvedContent.map((item) => {
                  const isSelected = localSelectedIds.has(item.id);
                  const type = typeConfig[item.type] || typeConfig.FILE;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className={`relative text-left rounded-xl border-2 p-4 transition-all duration-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/20 shadow-sm shadow-blue-500/10'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                      }`}
                    >
                      {/* Selection indicator */}
                      <div className={`absolute top-2.5 right-2.5 h-5 w-5 rounded-full flex items-center justify-center transition-all duration-200 ${
                        isSelected
                          ? 'bg-blue-600 text-white scale-100'
                          : 'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 scale-90 group-hover:scale-100'
                      }`}>
                        {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </div>

                      {/* Type icon */}
                      <div className={`h-10 w-10 rounded-xl ${type.bg} flex items-center justify-center mb-3 ${type.color}`}>
                        {type.icon}
                      </div>

                      {/* Title */}
                      <h4 className="font-semibold text-sm text-gray-900 dark:text-white truncate pr-6 leading-tight">
                        {item.title}
                      </h4>

                      {/* Description */}
                      {item.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}

                      {/* Meta */}
                      <div className="flex items-center gap-1.5 mt-3">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-medium border-gray-200 dark:border-gray-700">
                          {type.label}
                        </Badge>
                        {item.type === 'FILE' && item.fileSize && (
                          <span className="text-[10px] text-gray-400">
                            {(item.fileSize / 1024 / 1024).toFixed(1)} MB
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {approvedContent.length > 0 && (
          <DialogFooter className="flex items-center gap-2 border-t pt-4 sm:justify-between">
            <div className="hidden sm:block">
              {hasChanges && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  You have unsaved changes
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button variant="ghost" size="sm" onClick={handleDiscard} className="gap-1.5 text-gray-600">
                  <X className="h-3.5 w-3.5" />
                  Discard
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || updateMutation.isPending}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Save className="h-3.5 w-3.5" />
                {updateMutation.isPending ? 'Saving...' : 'Save Selection'}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
