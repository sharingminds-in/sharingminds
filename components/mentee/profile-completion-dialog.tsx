'use client';

import { useState, useEffect } from 'react';
import { UserCircle, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUserProfileQuery } from '@/hooks/queries/use-profile-queries';

const DISMISSED_KEY = 'profile_completion_dismissed';

const FIELD_LABELS: Record<string, string> = {
  currentRole: 'Current role',
  currentCompany: 'Current company',
  education: 'Education background',
  careerGoals: 'Career goals',
  currentSkills: 'Current skills',
  skillsToLearn: 'Skills to learn',
  interests: 'Interests',
  learningStyle: 'Learning style',
  preferredMeetingFrequency: 'Preferred meeting frequency',
};

function getMissingFields(menteeProfile: Record<string, unknown> | null | undefined): string[] {
  if (!menteeProfile) return Object.values(FIELD_LABELS);
  return Object.entries(FIELD_LABELS)
    .filter(([key]) => !menteeProfile[key])
    .map(([, label]) => label);
}

interface ProfileCompletionDialogProps {
  open: boolean;
  onCompleteProfile: () => void;
}

export function ProfileCompletionDialog({
  open,
  onCompleteProfile,
}: ProfileCompletionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: profileData } = useUserProfileQuery(open);

  const missingFields = getMissingFields(
    profileData?.menteeProfile as Record<string, unknown> | null | undefined
  );

  useEffect(() => {
    if (!open || missingFields.length === 0) return;
    const dismissed = sessionStorage.getItem(DISMISSED_KEY);
    if (!dismissed) {
      setIsOpen(true);
    }
  }, [open, missingFields.length]);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setIsOpen(false);
  };

  const handleComplete = () => {
    setIsOpen(false);
    onCompleteProfile();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md" overlayClassName="bg-black/60">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
              <UserCircle className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <DialogTitle className="text-lg">Complete Your Profile</DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            Help mentors understand you better by filling in all your profile
            details. A complete profile increases your chances of finding the
            right mentor.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-400 mb-2">
            Missing information
          </p>
          <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-500">
            {missingFields.map((label) => (
              <li key={label}>• {label}</li>
            ))}
          </ul>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            Remind me later
          </Button>
          <Button size="sm" onClick={handleComplete} className="gap-2">
            Complete My Profile
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
