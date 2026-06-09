'use client';

import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { AdminDirectMessageDialog } from './admin-direct-message-dialog';
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  RotateCcw,
  ShieldQuestion,
  XCircle,
  Phone,
  Github,
  Mail,
  MessageSquare,
  Crown,
  DollarSign,
  History,
  Send,
  Search,
} from 'lucide-react';
import Image from 'next/image';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { MentorAuditView } from './MentorAuditView';
import {
  type AdminMentorItem,
  useAdminMentorAuditQuery,
  useAdminMentorsQuery,
  useAdminMentorPricingHistoryQuery,
  useAdminSendMentorCouponMutation,
  useAdminUpdateMentorMutation,
  useAdminUpdateMentorPricingMutation,
} from '@/hooks/queries/use-admin-queries';

type VerificationStatus =
  | 'YET_TO_APPLY'
  | 'IN_PROGRESS'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REVERIFICATION'
  | 'RESUBMITTED'
  | 'UPDATED_PROFILE';

type Mentor = AdminMentorItem;

type MentorAction = Extract<
  VerificationStatus,
  'VERIFIED' | 'REJECTED' | 'REVERIFICATION'
>;

type NoteDialogState = {
  mentorId: string;
  status: MentorAction;
  note: string;
  submitting: boolean;
};

const statusBadgeClass: Record<VerificationStatus, string> = {
  VERIFIED: 'bg-emerald-100 text-emerald-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  YET_TO_APPLY: 'bg-slate-100 text-slate-700',
  REJECTED: 'bg-red-100 text-red-700',
  REVERIFICATION: 'bg-purple-100 text-purple-700',
  RESUBMITTED: 'bg-blue-100 text-blue-700',
  UPDATED_PROFILE: 'bg-blue-100 text-blue-700',
};

const statusCopy: Record<VerificationStatus, string> = {
  VERIFIED: 'Verified',
  IN_PROGRESS: 'In Review',
  YET_TO_APPLY: 'Draft',
  REJECTED: 'Rejected',
  REVERIFICATION: 'Needs Updates',
  RESUBMITTED: 'Resubmitted',
  UPDATED_PROFILE: 'Profile Updated',
};

const actionSuccessCopy: Record<MentorAction, string> = {
  VERIFIED: 'Mentor approved successfully',
  REJECTED: 'Mentor application rejected',
  REVERIFICATION: 'Mentor flagged for re-verification',
};

const pendingStatuses: VerificationStatus[] = [
  'YET_TO_APPLY',
  'IN_PROGRESS',
  'REVERIFICATION',
  'RESUBMITTED',
  'UPDATED_PROFILE',
];

const EMPTY_MENTORS: Mentor[] = [];

const pricingActionCopy: Record<string, string> = {
  MENTOR_RATE_SET: 'Mentor rate set',
  MENTOR_RATE_UPDATED: 'Mentor rate updated',
  ADMIN_OVERRIDE_UPDATED: 'Admin override updated',
  ADMIN_OVERRIDE_CLEARED: 'Admin override cleared',
};

function formatPricingHistoryRate(
  value: string | number | null,
  currency: string
) {
  return value === null ? 'None' : `${currency} ${value}/hr`;
}

function buildMentorToggleMap(
  mentors: Mentor[],
  getValue: (mentor: Mentor) => boolean,
) {
  return mentors.reduce<Record<string, boolean>>((acc, mentor) => {
    acc[mentor.id] = getValue(mentor);
    return acc;
  }, {});
}

function areToggleMapsEqual(
  left: Record<string, boolean>,
  right: Record<string, boolean>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

const renderAvailabilityBadge = (availability: boolean | null) => {
  if (availability === false) {
    return (
      <Badge
        variant='outline'
        className='border-transparent text-xs text-red-600'
      >
        Not accepting sessions
      </Badge>
    );
  }

  if (availability) {
    return (
      <Badge
        variant='outline'
        className='border-transparent text-xs text-emerald-600'
      >
        Accepting sessions
      </Badge>
    );
  }

  return (
    <Badge
      variant='outline'
      className='border-transparent text-xs text-muted-foreground'
    >
      Availability unknown
    </Badge>
  );
};

export function AdminMentors() {
  const [pendingAction, setPendingAction] = useState<{
    id: string;
    status: MentorAction;
  } | null>(null);
  const [noteDialog, setNoteDialog] = useState<NoteDialogState | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('pending');
  const [search, setSearch] = useState('');
  const [couponToggles, setCouponToggles] = useState<Record<string, boolean>>({});
  const [expertToggles, setExpertToggles] = useState<Record<string, boolean>>({});
  const [sendingCouponId, setSendingCouponId] = useState<string | null>(null);
  const [updatingExpertId, setUpdatingExpertId] = useState<string | null>(null);
  const [adminRateOverride, setAdminRateOverride] = useState('');
  const [rateOverrideReason, setRateOverrideReason] = useState('');
  const [messageRecipient, setMessageRecipient] = useState<Mentor | null>(null);
  const [verifiedFilters, setVerifiedFilters] = useState({
    paymentPending: false,
    couponEnabled: false,
  });
  const {
    data: mentors = EMPTY_MENTORS,
    isLoading,
    error,
    refetch,
  } = useAdminMentorsQuery();
  const updateMentorMutation = useAdminUpdateMentorMutation();
  const updateMentorPricingMutation = useAdminUpdateMentorPricingMutation();
  const sendMentorCouponMutation = useAdminSendMentorCouponMutation();

  useEffect(() => {
    const nextCouponToggles = buildMentorToggleMap(
      mentors,
      (mentor) => Boolean(mentor.isCouponCodeEnabled),
    );
    const nextExpertToggles = buildMentorToggleMap(
      mentors,
      (mentor) => Boolean(mentor.isExpert),
    );

    setCouponToggles((current) =>
      areToggleMapsEqual(current, nextCouponToggles)
        ? current
        : nextCouponToggles,
    );
    setExpertToggles((current) =>
      areToggleMapsEqual(current, nextExpertToggles)
        ? current
        : nextExpertToggles,
    );
  }, [mentors]);

  const selectedMentor = useMemo(
    () => mentors.find((mentor) => mentor.id === selectedMentorId) ?? null,
    [mentors, selectedMentorId],
  );

  useEffect(() => {
    setAdminRateOverride(selectedMentor?.adminHourlyRateOverride ?? '');
    setRateOverrideReason(selectedMentor?.rateOverrideReason ?? '');
  }, [
    selectedMentor?.id,
    selectedMentor?.adminHourlyRateOverride,
    selectedMentor?.rateOverrideReason,
  ]);
  const auditQuery = useAdminMentorAuditQuery(
    selectedMentor?.verificationStatus === 'UPDATED_PROFILE'
      ? selectedMentor.id
      : null,
  );
  const auditData = auditQuery.data ?? null;
  const isAuditLoading = auditQuery.isLoading;
  const pricingHistoryQuery = useAdminMentorPricingHistoryQuery(
    selectedMentor?.id
  );
  const pricingHistory = pricingHistoryQuery.data ?? [];

  const filteredMentors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mentors;

    return mentors.filter((mentor) => {
      const haystack = [
        mentor.name,
        mentor.fullName,
        mentor.email,
        mentor.title,
        mentor.company,
        mentor.industry,
        mentor.headline,
        mentor.about,
        mentor.location,
        mentor.city,
        mentor.state,
        mentor.country,
        ...mentor.expertise,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [mentors, search]);

  const pendingMentors = useMemo(
    () =>
      filteredMentors.filter((mentor) =>
        pendingStatuses.includes(mentor.verificationStatus),
      ),
    [filteredMentors],
  );

  const verifiedMentors = useMemo(
    () =>
      filteredMentors.filter(
        (mentor) => mentor.verificationStatus === 'VERIFIED',
      ),
    [filteredMentors],
  );

  const filteredVerifiedMentors = useMemo(() => {
    if (!verifiedFilters.paymentPending && !verifiedFilters.couponEnabled) {
      return verifiedMentors;
    }
    return verifiedMentors.filter((mentor) => {
      if (verifiedFilters.paymentPending && mentor.paymentStatus !== 'PENDING') {
        return false;
      }
      if (verifiedFilters.couponEnabled && !mentor.isCouponCodeEnabled) {
        return false;
      }
      return true;
    });
  }, [verifiedMentors, verifiedFilters]);

  const rejectedMentors = useMemo(
    () =>
      filteredMentors.filter(
        (mentor) => mentor.verificationStatus === 'REJECTED',
      ),
    [filteredMentors],
  );

  const stats = {
    total: mentors.length,
    pending: mentors.filter((mentor) =>
      pendingStatuses.includes(mentor.verificationStatus),
    ).length,
    verified: mentors.filter(
      (mentor) => mentor.verificationStatus === 'VERIFIED',
    ).length,
    rejected: mentors.filter(
      (mentor) => mentor.verificationStatus === 'REJECTED',
    ).length,
  };

  const isProcessing = (mentorId: string) => pendingAction?.id === mentorId;

  const handleStatusChange = async (
    mentorId: string,
    status: MentorAction,
    notes?: string | null,
    options?: { enableCoupon?: boolean }
  ): Promise<boolean> => {
    setPendingAction({ id: mentorId, status });
    try {
      await updateMentorMutation.mutateAsync({
        mentorId,
        status,
        notes: notes ?? undefined,
        enableCoupon: options?.enableCoupon,
      });

      toast.success(actionSuccessCopy[status]);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Update failed', { description: message });
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const openNoteDialog = (mentor: Mentor, status: MentorAction) => {
    setNoteDialog({
      mentorId: mentor.id,
      status,
      note: mentor.verificationNotes ?? '',
      submitting: false,
    });
  };

  const handleNoteSubmit = async () => {
    if (!noteDialog) return;
    setNoteDialog((prev) => (prev ? { ...prev, submitting: true } : prev));
    const success = await handleStatusChange(
      noteDialog.mentorId,
      noteDialog.status,
      noteDialog.note,
    );
    setNoteDialog((prev) => (prev ? { ...prev, submitting: false } : prev));
    if (success) {
      setNoteDialog(null);
    }
  };

  const handleRowClick = async (mentor: Mentor) => {
    setSelectedMentorId(mentor.id);
    setShowDetails(true);
  };

  const closeDetails = () => {
    setShowDetails(false);
    setSelectedMentorId(null);
  };

  const openMessageDialog = (mentor: Mentor) => {
    setMessageRecipient(mentor);
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    mentor: Mentor,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRowClick(mentor);
    }
  };

  const extractExpertise = (mentor: Mentor) =>
    Array.from(new Set((mentor.expertise || []).filter(Boolean)));

  const selectedMentorExpertise = useMemo(
    () => (selectedMentor ? extractExpertise(selectedMentor) : []),
    [selectedMentor],
  );

  const selectedMentorCouponEnabled = selectedMentor
    ? couponToggles[selectedMentor.id] ?? Boolean(selectedMentor.isCouponCodeEnabled)
    : false;
  const selectedMentorIsExpert = selectedMentor
    ? expertToggles[selectedMentor.id] ?? Boolean(selectedMentor.isExpert)
    : false;

  const handleCouponToggle = (mentorId: string, checked: boolean) => {
    setCouponToggles((prev) => ({ ...prev, [mentorId]: checked }));
  };

  const handleExpertToggle = async (mentor: Mentor, checked: boolean) => {
    if (mentor.verificationStatus !== 'VERIFIED') {
      toast.error('Only verified mentors can be marked as expert');
      return;
    }
    const previousValue = expertToggles[mentor.id] ?? Boolean(mentor.isExpert);
    setExpertToggles((prev) => ({ ...prev, [mentor.id]: checked }));
    setUpdatingExpertId(mentor.id);
    try {
      await updateMentorMutation.mutateAsync({
        mentorId: mentor.id,
        status: mentor.verificationStatus,
        isExpert: checked,
      });

      toast.success(checked ? 'Mentor marked as expert' : 'Mentor removed from expert list');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      setExpertToggles((prev) => ({ ...prev, [mentor.id]: previousValue }));
      toast.error('Failed to update expert status', { description: message });
    } finally {
      setUpdatingExpertId(null);
    }
  };
  const getCouponButtonClasses = (isResend: boolean) =>
    isResend
      ? 'bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500'
      : 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500';

  const handleSendCouponCode = async (mentorId: string) => {
    setSendingCouponId(mentorId);
    try {
      await sendMentorCouponMutation.mutateAsync({ mentorId });

      toast.success('Coupon code sent successfully');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Failed to send coupon code', { description: message });
    } finally {
      setSendingCouponId(null);
    }
  };

  const saveMentorPricing = async (clearOverride = false) => {
    if (!selectedMentor) return;

    const normalizedValue = adminRateOverride.trim();
    const parsedOverride = clearOverride
      ? null
      : normalizedValue === ''
        ? null
        : Number(normalizedValue);

    if (
      parsedOverride !== null &&
      (!Number.isFinite(parsedOverride) || parsedOverride < 0)
    ) {
      toast.error('Enter a valid non-negative hourly rate');
      return;
    }

    try {
      await updateMentorPricingMutation.mutateAsync({
        mentorId: selectedMentor.id,
        adminHourlyRateOverride: parsedOverride,
        reason: clearOverride ? null : rateOverrideReason.trim() || null,
      });
      if (clearOverride) {
        setAdminRateOverride('');
        setRateOverrideReason('');
      }
      toast.success(
        parsedOverride === null
          ? 'Mentor rate override cleared'
          : 'Mentor pricing updated'
      );
    } catch (error) {
      toast.error('Failed to update mentor pricing', {
        description:
          error instanceof Error ? error.message : 'Something went wrong',
      });
    }
  };

  const renderMentorList = (rows: Mentor[], options?: { showCouponToggle?: boolean }) => {
    if (!rows.length) {
      return (
        <div className='flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 py-12 text-sm text-muted-foreground'>
          <ShieldQuestion className='h-6 w-6' />
          {search.trim()
            ? 'No mentors found for that search term.'
            : 'No mentors found for this view.'}
        </div>
      );
    }

    return (
      <TooltipProvider delayDuration={150}>
        <div className='space-y-3'>
          {rows.map((mentor) => {
            const displayName =
              mentor.name || mentor.fullName || 'Unknown mentor';
            const uniqueExpertise = extractExpertise(mentor);
            const expertisePreview = uniqueExpertise.slice(0, 4);
            const extraExpertise = uniqueExpertise.slice(
              expertisePreview.length,
            );
            const registered = mentor.createdAt
              ? format(new Date(mentor.createdAt), 'PP')
              : '?';

            const handleButtonClick =
              (action: () => void | Promise<unknown>) =>
              (event: ReactMouseEvent) => {
                event.stopPropagation();
                void action();
              };

            const couponEnabled = options?.showCouponToggle
              ? couponToggles[mentor.id] ?? Boolean(mentor.isCouponCodeEnabled)
              : false;
            const expertEnabled = expertToggles[mentor.id] ?? Boolean(mentor.isExpert);

            return (
              <article
                key={mentor.id}
                role='button'
                tabIndex={0}
                aria-label={`View details for ${displayName}`}
                onClick={() => handleRowClick(mentor)}
                onKeyDown={(event) => handleRowKeyDown(event, mentor)}
                className='group relative flex flex-col gap-4 rounded-xl border border-border bg-card/95 p-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              >
                <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                  <div className='space-y-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='text-base font-semibold leading-tight text-foreground'>
                        {displayName}
                      </p>
                      <Badge
                        variant='outline'
                        className={cn(
                          'border-transparent text-xs capitalize',
                          statusBadgeClass[mentor.verificationStatus],
                        )}
                      >
                        {statusCopy[mentor.verificationStatus]}
                      </Badge>
                      {renderAvailabilityBadge(mentor.isAvailable)}
                      {expertEnabled && (
                        <Badge
                          variant='outline'
                          className='border-amber-200 bg-amber-50 text-amber-700 text-xs'
                        >
                          <Crown className='mr-1 h-3 w-3' />
                          Expert
                        </Badge>
                      )}
                    </div>
                    {mentor.headline && (
                      <p className='max-w-2xl text-sm text-muted-foreground'>
                        {mentor.headline}
                      </p>
                    )}
                    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                      <span>Joined {registered}</span>
                      {mentor.location && (
                        <span className='inline-flex items-center gap-1'>
                          <MapPin className='h-3 w-3 shrink-0' />
                          {mentor.location}
                        </span>
                      )}
                    </div>
                    {mentor.verificationNotes && (
                      <p className='text-xs text-muted-foreground line-clamp-2'>
                        Latest note: {mentor.verificationNotes}
                      </p>
                    )}
                  </div>
                  <div className='flex flex-col items-start gap-2 text-sm text-muted-foreground md:items-end'>
                    {mentor.email && (
                      <a
                        href={`mailto:${mentor.email}`}
                        onClick={(event) => event.stopPropagation()}
                        className='font-medium text-primary hover:underline'
                      >
                        {mentor.email}
                      </a>
                    )}
                    <div className='flex flex-wrap justify-end gap-2 text-xs'>
                      {mentor.linkedinUrl && (
                        <Button
                          variant='outline'
                          size='sm'
                          className='gap-1.5'
                          asChild
                          onClick={(event) => event.stopPropagation()}
                        >
                          <a
                            href={mentor.linkedinUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            <ExternalLink className='h-3 w-3' />
                            LinkedIn
                          </a>
                        </Button>
                      )}
                      {mentor.resumeUrl && (
                        <Button
                          variant='outline'
                          size='sm'
                          className='gap-1.5'
                          asChild
                          onClick={(event) => event.stopPropagation()}
                        >
                          <a
                            href={mentor.resumeUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            <FileText className='h-3 w-3' />
                            Resume
                          </a>
                        </Button>
                      )}
                      {mentor.websiteUrl && (
                        <Button
                          variant='outline'
                          size='sm'
                          className='gap-1.5'
                          asChild
                          onClick={(event) => event.stopPropagation()}
                        >
                          <a
                            href={mentor.websiteUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            <ExternalLink className='h-3 w-3' />
                            Website
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <Separator className='border-dashed border-border/60' />

                <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                      Expertise
                    </p>
                    <div className='mt-2 flex flex-wrap gap-2'>
                      {expertisePreview.map((item, index) => (
                        <Tooltip key={`${mentor.id}-expertise-${index}`}>
                          <TooltipTrigger asChild>
                            <Badge
                              variant='secondary'
                              className='max-w-[180px] truncate text-xs font-medium'
                            >
                              {item}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{item}</TooltipContent>
                        </Tooltip>
                      ))}
                      {extraExpertise.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant='outline'
                              className='text-xs font-medium'
                            >
                              +{extraExpertise.length} more
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className='max-w-xs'>
                            <ul className='space-y-1 text-xs'>
                              {extraExpertise.map((item, index) => (
                                <li key={`${mentor.id}-extra-${index}`}>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {!expertisePreview.length && (
                        <span className='text-xs text-muted-foreground'>
                          No expertise listed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className='flex flex-1 flex-col gap-3 md:items-end'>
                    <div className='text-left md:text-right'>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        Effective session rate
                      </p>
                      <p className='mt-1 text-sm font-semibold text-foreground'>
                        {mentor.effectiveHourlyRate !== null
                          ? `${mentor.currency ?? 'USD'} ${mentor.effectiveHourlyRate}/hr`
                          : 'Not provided'}
                      </p>
                      {mentor.adminHourlyRateOverride !== null && (
                        <p className='text-xs text-amber-600'>Admin override</p>
                      )}
                    </div>
                    {mentor.verificationStatus === 'VERIFIED' && (
                      <label className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
                        <Checkbox
                          checked={expertEnabled}
                          onCheckedChange={(checked) =>
                            void handleExpertToggle(mentor, Boolean(checked))
                          }
                          disabled={updatingExpertId === mentor.id}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <span>Mark as expert</span>
                        {updatingExpertId === mentor.id && (
                          <Loader2 className='h-3.5 w-3.5 animate-spin' />
                        )}
                      </label>
                    )}
                    {options?.showCouponToggle && (
                      <label className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
                        <Checkbox
                          checked={couponEnabled}
                          onCheckedChange={(checked) =>
                            handleCouponToggle(mentor.id, Boolean(checked))
                          }
                          onClick={(event) => event.stopPropagation()}
                        />
                        <span>Enable coupon code</span>
                      </label>
                    )}
                    <div className='flex flex-wrap justify-start gap-2 md:justify-end'>
                      {(mentor.verificationStatus === 'IN_PROGRESS' || mentor.verificationStatus === 'RESUBMITTED' || mentor.verificationStatus === 'UPDATED_PROFILE') && (
                        <>
                        <Button
                          size='sm'
                          className='gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700'
                          onClick={handleButtonClick(() =>
                            handleStatusChange(mentor.id, 'VERIFIED', '', {
                              enableCoupon: couponEnabled,
                            }),
                          )}
                          disabled={isProcessing(mentor.id)}
                        >
                          {isProcessing(mentor.id) &&
                          pendingAction?.status === 'VERIFIED' ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          ) : (
                            <CheckCircle2 className='h-4 w-4' />
                          )}
                          Approve
                        </Button>
                        <Button
                          variant='secondary'
                          size='sm'
                          className='gap-1.5'
                          onClick={handleButtonClick(() =>
                            openNoteDialog(mentor, 'REVERIFICATION'),
                          )}
                          disabled={isProcessing(mentor.id)}
                        >
                          {isProcessing(mentor.id) &&
                          pendingAction?.status === 'REVERIFICATION' ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          ) : (
                            <RotateCcw className='h-4 w-4' />
                          )}
                          Request updates
                        </Button>
                        {mentor.verificationStatus !== 'UPDATED_PROFILE' && (
                          <Button
                            variant='destructive'
                            size='sm'
                            className='gap-1.5'
                            onClick={handleButtonClick(() =>
                              openNoteDialog(mentor, 'REJECTED'),
                            )}
                            disabled={isProcessing(mentor.id)}
                          >
                            {isProcessing(mentor.id) &&
                            pendingAction?.status === 'REJECTED' ? (
                              <Loader2 className='h-4 w-4 animate-spin' />
                            ) : (
                              <XCircle className='h-4 w-4' />
                            )}
                            Reject
                          </Button>
                        )}
                      </>
                    )}
                    {mentor.verificationStatus === 'VERIFIED' && (
                      <>
                        {mentor.paymentStatus === 'PENDING' && (
                          <Button
                            variant='secondary'
                            size='sm'
                            className={cn(
                              'gap-1.5',
                              getCouponButtonClasses(Boolean(mentor.isCouponCodeEnabled)),
                            )}
                            onClick={handleButtonClick(() =>
                              handleSendCouponCode(mentor.id),
                            )}
                            disabled={sendingCouponId === mentor.id}
                          >
                            {sendingCouponId === mentor.id ? (
                              <Loader2 className='h-4 w-4 animate-spin' />
                            ) : (
                              <Send className='h-4 w-4' />
                            )}
                            {mentor.isCouponCodeEnabled
                              ? 'Re-send coupon code'
                              : 'Send coupon code'}
                          </Button>
                        )}
                        <Button
                          variant='destructive'
                          size='sm'
                          className='gap-1.5'
                          onClick={handleButtonClick(() =>
                            openNoteDialog(mentor, 'REJECTED'),
                          )}
                          disabled={isProcessing(mentor.id)}
                        >
                          {isProcessing(mentor.id) &&
                          pendingAction?.status === 'REJECTED' ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          ) : (
                            <XCircle className='h-4 w-4' />
                          )}
                          Reject
                        </Button>
                      </>
                    )}
                    {mentor.verificationStatus === 'REJECTED' && (
                      <>
                        <Button
                          size='sm'
                          className='gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700'
                          onClick={handleButtonClick(() =>
                            handleStatusChange(mentor.id, 'VERIFIED', '', {
                              enableCoupon: couponEnabled,
                            }),
                          )}
                          disabled={isProcessing(mentor.id)}
                        >
                          {isProcessing(mentor.id) &&
                          pendingAction?.status === 'VERIFIED' ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          ) : (
                            <CheckCircle2 className='h-4 w-4' />
                          )}
                          Approve
                        </Button>
                      </>
                    )}
                    <Button
                      variant='outline'
                      size='sm'
                      className='gap-1.5'
                      onClick={handleButtonClick(() => openMessageDialog(mentor))}
                    >
                      <MessageSquare className='h-4 w-4' />
                      Message
                    </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </TooltipProvider>
    );
  };

  const renderPricingHistory = () => (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <History className='h-4 w-4' />
          Pricing history
        </CardTitle>
        <CardDescription>
          Immutable mentor and admin rate changes, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pricingHistoryQuery.isLoading ? (
          <div className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Loading pricing history...
          </div>
        ) : pricingHistoryQuery.error ? (
          <p className='py-6 text-sm text-red-600'>
            Unable to load pricing history.
          </p>
        ) : pricingHistory.length === 0 ? (
          <p className='py-6 text-sm text-muted-foreground'>
            No dedicated pricing changes have been recorded yet.
          </p>
        ) : (
          <div className='space-y-3'>
            {pricingHistory.map((entry) => (
              <div
                key={entry.id}
                className='rounded-lg border border-border/70 p-4'
              >
                <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='space-y-1'>
                    <Badge variant='outline'>
                      {pricingActionCopy[entry.action] ?? entry.action}
                    </Badge>
                    <p className='text-sm font-medium'>
                      {entry.actorName ||
                        entry.actorEmail ||
                        'Deleted user'}
                    </p>
                    <p className='text-xs capitalize text-muted-foreground'>
                      {entry.actorRole}
                      {entry.actorEmail && entry.actorName
                        ? ` - ${entry.actorEmail}`
                        : ''}
                    </p>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {format(new Date(entry.createdAt), 'PPp')}
                  </p>
                </div>

                <div className='mt-4 grid gap-3 text-sm md:grid-cols-3'>
                  <div>
                    <p className='text-xs text-muted-foreground'>
                      Mentor rate
                    </p>
                    <p>
                      {formatPricingHistoryRate(
                        entry.previousMentorRate,
                        entry.currency
                      )}{' '}
                      -&gt;{' '}
                      {formatPricingHistoryRate(
                        entry.newMentorRate,
                        entry.currency
                      )}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>
                      Admin override
                    </p>
                    <p>
                      {formatPricingHistoryRate(
                        entry.previousAdminOverride,
                        entry.currency
                      )}{' '}
                      -&gt;{' '}
                      {formatPricingHistoryRate(
                        entry.newAdminOverride,
                        entry.currency
                      )}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>
                      Effective rate
                    </p>
                    <p className='font-semibold text-primary'>
                      {formatPricingHistoryRate(
                        entry.previousEffectiveRate,
                        entry.currency
                      )}{' '}
                      -&gt;{' '}
                      {formatPricingHistoryRate(
                        entry.newEffectiveRate,
                        entry.currency
                      )}
                    </p>
                  </div>
                </div>

                {entry.reason && (
                  <p className='mt-3 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground'>
                    Reason: {entry.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const noteDialogMentor = noteDialog
    ? mentors.find((mentor) => mentor.id === noteDialog.mentorId) ?? null
    : null;

  if (isLoading) {
    return (
      <div className='flex h-[70vh] flex-col items-center justify-center gap-3 text-muted-foreground'>
        <Loader2 className='h-6 w-6 animate-spin' />
        Loading mentor applications...
      </div>
    );
  }

  if (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to load mentors';
    return (
      <div className='flex h-[70vh] flex-col items-center justify-center gap-3 text-center text-sm text-red-600'>
        <ShieldQuestion className='h-6 w-6' />
        <p>We ran into a problem loading mentors.</p>
        <p className='text-xs text-muted-foreground'>{message}</p>
        <Button size='sm' onClick={() => void refetch()} className='mt-2'>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div className='space-y-6 p-6'>
      <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Total mentors</CardDescription>
            <CardTitle className='text-2xl'>{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Pending review</CardDescription>
            <CardTitle className='text-2xl text-amber-600'>
              {stats.pending}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Verified mentors</CardDescription>
            <CardTitle className='text-2xl text-emerald-600'>
              {stats.verified}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Rejected</CardDescription>
            <CardTitle className='text-2xl text-red-600'>
              {stats.rejected}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
            <CardTitle>Mentor verification</CardTitle>
            <CardDescription>
              Review and manage expert applications.
            </CardDescription>
          </div>
          <div className='flex w-full max-w-sm items-center gap-2'>
            <Search className='h-4 w-4 text-muted-foreground' />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Search by name, email, expertise...'
              className='h-9'
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
            <TabsList className='mb-4 w-full justify-start'>
              <TabsTrigger value='pending'>
                Pending review ({pendingMentors.length})
              </TabsTrigger>
              <TabsTrigger value='verified'>
                Verified ({verifiedMentors.length})
              </TabsTrigger>
              <TabsTrigger value='rejected'>
                Rejected ({rejectedMentors.length})
              </TabsTrigger>
              <TabsTrigger value='all'>All ({filteredMentors.length})</TabsTrigger>
            </TabsList>
            <TabsContent value='pending'>
              {renderMentorList(pendingMentors, { showCouponToggle: true })}
            </TabsContent>
            <TabsContent value='verified'>
              <div className='mb-4 flex flex-wrap gap-4 rounded-md border border-border/60 bg-muted/30 p-3 text-sm'>
                <label className='inline-flex items-center gap-2'>
                  <Checkbox
                    checked={verifiedFilters.paymentPending}
                    onCheckedChange={(checked) =>
                      setVerifiedFilters((prev) => ({
                        ...prev,
                        paymentPending: Boolean(checked),
                      }))
                    }
                  />
                  <span>Payment pending</span>
                </label>
                <label className='inline-flex items-center gap-2'>
                  <Checkbox
                    checked={verifiedFilters.couponEnabled}
                    onCheckedChange={(checked) =>
                      setVerifiedFilters((prev) => ({
                        ...prev,
                        couponEnabled: Boolean(checked),
                      }))
                    }
                  />
                  <span>Coupon code enabled</span>
                </label>
              </div>
              {renderMentorList(filteredVerifiedMentors)}
            </TabsContent>
            <TabsContent value='rejected'>
              {renderMentorList(rejectedMentors)}
            </TabsContent>
            <TabsContent value='all'>
              {renderMentorList(filteredMentors)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={!!noteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setNoteDialog(null);
          }
        }}
      >
        {noteDialog && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {noteDialog.status === 'REJECTED'
                  ? 'Reject mentor application'
                  : 'Request mentor updates'}
              </DialogTitle>
              <DialogDescription>
                {noteDialog.status === 'REJECTED'
                  ? 'Share a short note so the mentor understands why the application was rejected.'
                  : 'Let the mentor know what needs to be updated before approval.'}
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-3'>
              <div className='text-sm'>
                <span className='font-medium'>
                  {noteDialogMentor?.name ||
                    noteDialogMentor?.fullName ||
                    'Mentor'}
                </span>
              </div>
              <Textarea
                value={noteDialog.note}
                onChange={(event) =>
                  setNoteDialog((prev) =>
                    prev ? { ...prev, note: event.target.value } : prev,
                  )
                }
                placeholder='Provide context for this decision...'
                rows={4}
              />
            </div>
            <DialogFooter className='gap-2 sm:gap-0'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setNoteDialog(null)}
                disabled={noteDialog.submitting}
              >
                Cancel
              </Button>
              <Button
                type='button'
                variant={noteDialog.status === 'REJECTED' ? 'destructive' : 'default'}
                onClick={handleNoteSubmit}
                disabled={noteDialog.submitting || !noteDialog.note.trim()}
                className='gap-1.5'
              >
                {noteDialog.submitting ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : noteDialog.status === 'REJECTED' ? (
                  <XCircle className='h-4 w-4' />
                ) : (
                  <RotateCcw className='h-4 w-4' />
                )}
                Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={showDetails && !!selectedMentor}
        onOpenChange={(open) => {
          if (!open) {
            closeDetails();
          }
        }}
      >
        {showDetails && selectedMentor && (
          <DialogContent className="max-w-4xl">
            <div className="max-h-[80vh] overflow-y-auto p-6 space-y-6">
              {isAuditLoading ? (
                <>
                  {/* FIX: Added Header/Title here to satisfy accessibility requirements during loading */}
                  <DialogHeader>
                    <DialogTitle>Loading details</DialogTitle>
                    <DialogDescription>
                      Fetching mentor information...
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex h-[50vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                </>
              ) : auditData && selectedMentor.verificationStatus === 'UPDATED_PROFILE' ? (
                <>
                  <DialogHeader>
                    <DialogTitle id='mentor-detail-title'>Profile Change Review</DialogTitle>
                    <DialogDescription id='mentor-detail-description'>
                      Review the changes submitted by the mentor.
                    </DialogDescription>
                  </DialogHeader>
                  <MentorAuditView previousData={auditData.previousData} updatedData={auditData.updatedData} />
                  {renderPricingHistory()}
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle id='mentor-detail-title'>Mentor details</DialogTitle>
                    <DialogDescription id='mentor-detail-description'>
                      Detailed mentor application profile
                    </DialogDescription>
                  </DialogHeader>

                  <section
                    aria-labelledby='mentor-overview-heading'
                    className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'
                  >
                    <div className='flex items-center gap-4'>
                      {selectedMentor.profileImageUrl ? (
                        <Image
                          src={selectedMentor.profileImageUrl}
                          alt={selectedMentor.fullName || 'Mentor profile picture'}
                          width={96}
                          height={96}
                          className='h-24 w-24 rounded-full object-cover'
                        />
                      ) : (
                        <div className='flex h-24 w-24 items-center justify-center rounded-full bg-gray-200 text-2xl font-semibold text-gray-600'>
                          {selectedMentor.fullName?.charAt(0) ||
                            selectedMentor.email?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className='space-y-1'>
                        <h3
                          id='mentor-overview-heading'
                          className='text-xl font-semibold text-foreground'
                        >
                          {selectedMentor.name || selectedMentor.fullName || 'Mentor'}
                        </h3>
                        {selectedMentor.headline && (
                          <p className='text-sm text-muted-foreground'>
                            {selectedMentor.headline}
                          </p>
                        )}
                        <div className='flex flex-wrap items-center gap-2'>
                          <Badge
                            variant='outline'
                            className={cn(
                              'border-transparent text-xs capitalize',
                              statusBadgeClass[selectedMentor.verificationStatus],
                            )}
                          >
                            {statusCopy[selectedMentor.verificationStatus]}
                          </Badge>
                          {selectedMentorIsExpert && (
                            <Badge
                              variant='outline'
                              className='border-amber-200 bg-amber-50 text-amber-700 text-xs'
                            >
                              <Crown className='mr-1 h-3 w-3' />
                              Expert
                            </Badge>
                          )}
                          {renderAvailabilityBadge(selectedMentor.isAvailable)}
                          {selectedMentor.location && (
                            <span className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
                              <MapPin className='h-3 w-3' />
                              {selectedMentor.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {selectedMentor.linkedinUrl && (
                        <Button variant='outline' size='sm' className='gap-1.5' asChild>
                          <a
                            href={selectedMentor.linkedinUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            <ExternalLink className='h-3 w-3' />
                            LinkedIn
                          </a>
                        </Button>
                      )}
                      {selectedMentor.githubUrl && (
                        <Button variant='outline' size='sm' className='gap-1.5' asChild>
                          <a
                            href={selectedMentor.githubUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            <Github className='h-3 w-3' />
                            GitHub
                          </a>
                        </Button>
                      )}
                      {selectedMentor.resumeUrl && (
                        <Button variant='outline' size='sm' className='gap-1.5' asChild>
                          <a
                            href={selectedMentor.resumeUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            <FileText className='h-3 w-3' />
                            Resume
                          </a>
                        </Button>
                      )}
                      {selectedMentor.websiteUrl && (
                        <Button variant='outline' size='sm' className='gap-1.5' asChild>
                          <a
                            href={selectedMentor.websiteUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            <ExternalLink className='h-3 w-3' />
                            Website
                          </a>
                        </Button>
                      )}
                    </div>
                  </section>

                  <Separator />

                  <Card>
                    <CardHeader>
                      <CardTitle className='flex items-center gap-2 text-base'>
                        <DollarSign className='h-4 w-4' />
                        Session pricing
                      </CardTitle>
                      <CardDescription>
                        Set an optional platform override. Leaving it empty uses
                        the mentor&apos;s requested hourly rate.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                      <div className='grid gap-4 md:grid-cols-3'>
                        <div>
                          <p className='text-xs text-muted-foreground'>
                            Mentor requested rate
                          </p>
                          <p className='font-semibold'>
                            {selectedMentor.hourlyRate
                              ? `${selectedMentor.currency ?? 'USD'} ${selectedMentor.hourlyRate}/hr`
                              : 'Not provided'}
                          </p>
                        </div>
                        <div>
                          <p className='text-xs text-muted-foreground'>
                            Current admin override
                          </p>
                          <p className='font-semibold'>
                            {selectedMentor.adminHourlyRateOverride !== null
                              ? `${selectedMentor.currency ?? 'USD'} ${selectedMentor.adminHourlyRateOverride}/hr`
                              : 'None'}
                          </p>
                        </div>
                        <div>
                          <p className='text-xs text-muted-foreground'>
                            Effective standard rate
                          </p>
                          <p className='font-semibold text-primary'>
                            {selectedMentor.effectiveHourlyRate !== null
                              ? `${selectedMentor.currency ?? 'USD'} ${selectedMentor.effectiveHourlyRate}/hr`
                              : 'Not provided'}
                          </p>
                        </div>
                      </div>

                      <div className='grid gap-4 md:grid-cols-2'>
                        <div className='space-y-2'>
                          <Label htmlFor='admin-hourly-rate'>
                            Admin hourly rate override
                          </Label>
                          <Input
                            id='admin-hourly-rate'
                            type='number'
                            min='0'
                            step='0.01'
                            value={adminRateOverride}
                            onChange={(event) =>
                              setAdminRateOverride(event.target.value)
                            }
                            placeholder={`Use mentor rate (${selectedMentor.currency ?? 'USD'})`}
                          />
                        </div>
                        <div className='space-y-2'>
                          <Label htmlFor='rate-override-reason'>
                            Override reason
                          </Label>
                          <Textarea
                            id='rate-override-reason'
                            value={rateOverrideReason}
                            onChange={(event) =>
                              setRateOverrideReason(event.target.value)
                            }
                            maxLength={500}
                            placeholder='Optional internal context for this rate'
                          />
                        </div>
                      </div>

                      <div className='flex flex-wrap justify-end gap-2'>
                        {selectedMentor.adminHourlyRateOverride !== null && (
                          <Button
                            type='button'
                            variant='outline'
                            onClick={() => void saveMentorPricing(true)}
                            disabled={updateMentorPricingMutation.isPending}
                          >
                            Use mentor rate
                          </Button>
                        )}
                        <Button
                          type='button'
                          onClick={() => void saveMentorPricing()}
                          disabled={updateMentorPricingMutation.isPending}
                        >
                          {updateMentorPricingMutation.isPending && (
                            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                          )}
                          Save pricing
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {renderPricingHistory()}

                  <section
                    aria-labelledby='mentor-summary-heading'
                    className='grid gap-6 md:grid-cols-2'
                  >
                    <div>
                      <h4
                        id='mentor-summary-heading'
                        className='text-sm font-semibold text-foreground'
                      >
                        Application summary
                      </h4>
                      <dl className='mt-3 space-y-3 text-sm text-muted-foreground'>
                        <div className='flex items-start justify-between gap-4'>
                          <dt className='font-medium text-foreground'>Experience</dt>
                          <dd>
                            {selectedMentor.experienceYears
                              ? `${selectedMentor.experienceYears} years`
                              : 'Not provided'}
                          </dd>
                        </div>
                        <div className='flex items-start justify-between gap-4'>
                          <dt className='font-medium text-foreground'>Rate</dt>
                          <dd>
                            {selectedMentor.hourlyRate
                              ? `${selectedMentor.currency ?? 'USD'} ${selectedMentor.hourlyRate}/hr`
                              : 'Not provided'}
                          </dd>
                        </div>
                        <div className='flex items-start justify-between gap-4'>
                          <dt className='font-medium text-foreground'>Company</dt>
                          <dd className='max-w-[200px] break-words'>
                            {selectedMentor.company || 'Not provided'}
                          </dd>
                        </div>
                        <div className='flex items-start justify-between gap-4'>
                          <dt className='font-medium text-foreground'>Industry</dt>
                          <dd className='max-w-[200px] break-words'>
                            {selectedMentor.industry || 'Not provided'}
                          </dd>
                        </div>
                        <div className='flex items-start justify-between gap-4'>
                          <dt className='font-medium text-foreground'>Joined</dt>
                          <dd>
                            {selectedMentor.createdAt
                              ? format(new Date(selectedMentor.createdAt), 'PP')
                              : 'Unknown'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div>
                      <h4
                        id='mentor-contact-heading'
                        className='text-sm font-semibold text-foreground'
                      >
                        Contact
                      </h4>
                      <div className='mt-3 flex flex-col space-y-2 text-sm text-muted-foreground'>
                        {selectedMentor.email && (
                          <div className='inline-flex items-center gap-1'>
                            <Mail className='h-3 w-3' />
                            <a
                              href={`mailto:${selectedMentor.email}`}
                              className='font-medium text-primary hover:underline'
                            >
                              {selectedMentor.email}
                            </a>
                          </div>
                        )}
                        {selectedMentor.phone && (
                          <div className='inline-flex items-center gap-1'>
                            <Phone className='h-3 w-3' />
                            <a
                              href={`tel:${selectedMentor.phone}`}
                              className='font-medium text-primary hover:underline'
                            >
                              {selectedMentor.phone}
                            </a>
                          </div>
                        )}
                        {selectedMentor.city && (
                          <p>
                            City: <span className='font-medium'>{selectedMentor.city}</span>
                          </p>
                        )}
                        {selectedMentor.state && (
                          <p>
                            State: <span className='font-medium'>{selectedMentor.state}</span>
                          </p>
                        )}
                        {selectedMentor.country && (
                          <p>
                            Country:{' '}
                            <span className='font-medium'>{selectedMentor.country}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  <Separator />

                  <section
                    aria-labelledby='mentor-expertise-heading'
                    className='space-y-3'
                  >
                    <h4
                      id='mentor-expertise-heading'
                      className='text-sm font-semibold text-foreground'
                    >
                      Expertise
                    </h4>
                    <div className='flex flex-wrap gap-2'>
                      {selectedMentorExpertise.map((item, index) => (
                        <Badge
                          key={`${selectedMentor.id}-detail-expertise-${index}`}
                          variant='secondary'
                          className='break-all text-xs'
                        >
                          {item}
                        </Badge>
                      ))}
                      {selectedMentorExpertise.length === 0 && (
                        <span className='text-sm text-muted-foreground'>
                          No expertise listed
                        </span>
                      )}
                    </div>
                  </section>

                  <Separator />

                  <section
                    aria-labelledby='mentor-about-heading'
                    className='space-y-3'
                  >
                    <h4
                      id='mentor-about-heading'
                      className='text-sm font-semibold text-foreground'
                    >
                      About
                    </h4>
                    <p className='whitespace-pre-line text-sm text-muted-foreground'>
                      {selectedMentor.about || 'No additional biography provided.'}
                    </p>
                  </section>

                  {selectedMentor.verificationNotes && (
                    <section
                      aria-labelledby='mentor-notes-heading'
                      className='space-y-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-4 text-sm text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200'
                    >
                      <h4
                        id='mentor-notes-heading'
                        className='font-semibold text-amber-800 dark:text-amber-200'
                      >
                        Latest reviewer note
                      </h4>
                      <p className='whitespace-pre-line'>
                        {selectedMentor.verificationNotes}
                      </p>
                    </section>
                  )}
                </>
              )}
            </div>
            <DialogFooter className="pt-4 border-t">
              <section className='flex flex-wrap justify-end gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  className='gap-1.5'
                  onClick={() => openMessageDialog(selectedMentor)}
                >
                  <MessageSquare className='h-4 w-4' />
                  Message
                </Button>
                {(selectedMentor.verificationStatus === 'IN_PROGRESS' || selectedMentor.verificationStatus === 'RESUBMITTED' || selectedMentor.verificationStatus === 'UPDATED_PROFILE') && (
                  <>
                    <Button
                      size='sm'
                      className='gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700'
                      onClick={() =>
                        handleStatusChange(selectedMentor.id, 'VERIFIED', '', {
                          enableCoupon: selectedMentorCouponEnabled,
                        })
                      }
                      disabled={isProcessing(selectedMentor.id)}
                    >
                      {isProcessing(selectedMentor.id) && pendingAction?.status === 'VERIFIED' ? (
                        <Loader2 className='h-4 w-4 animate-spin' />
                      ) : (
                        <CheckCircle2 className='h-4 w-4' />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant='secondary'
                      size='sm'
                      className='gap-1.5'
                      onClick={() => openNoteDialog(selectedMentor, 'REVERIFICATION')}
                      disabled={isProcessing(selectedMentor.id)}
                    >
                      {isProcessing(selectedMentor.id) && pendingAction?.status === 'REVERIFICATION' ? (
                        <Loader2 className='h-4 w-4 animate-spin' />
                      ) : (
                        <RotateCcw className='h-4 w-4' />
                      )}
                      Request updates
                    </Button>
                    {selectedMentor.verificationStatus !== 'UPDATED_PROFILE' && (
                      <Button
                        variant='destructive'
                        size='sm'
                        className='gap-1.5'
                        onClick={() => openNoteDialog(selectedMentor, 'REJECTED')}
                        disabled={isProcessing(selectedMentor.id)}
                      >
                        {isProcessing(selectedMentor.id) && pendingAction?.status === 'REJECTED' ? (
                          <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                          <XCircle className='h-4 w-4' />
                        )}
                        Reject
                      </Button>
                    )}
                  </>
                )}
                {selectedMentor.verificationStatus === 'VERIFIED' && (
                  <>
                    {selectedMentor.paymentStatus === 'PENDING' && (
                      <Button
                        variant='secondary'
                        size='sm'
                        className={cn(
                          'gap-1.5',
                          getCouponButtonClasses(Boolean(selectedMentor.isCouponCodeEnabled)),
                        )}
                        onClick={() => handleSendCouponCode(selectedMentor.id)}
                        disabled={sendingCouponId === selectedMentor.id}
                      >
                        {sendingCouponId === selectedMentor.id ? (
                          <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                          <Send className='h-4 w-4' />
                        )}
                        {selectedMentor.isCouponCodeEnabled
                          ? 'Re-send coupon code'
                          : 'Send coupon code'}
                      </Button>
                    )}
                    <Button
                      variant='destructive'
                      size='sm'
                      className='gap-1.5'
                      onClick={() => openNoteDialog(selectedMentor, 'REJECTED')}
                      disabled={isProcessing(selectedMentor.id)}
                    >
                      {isProcessing(selectedMentor.id) && pendingAction?.status === 'REJECTED' ? (
                        <Loader2 className='h-4 w-4 animate-spin' />
                      ) : (
                        <XCircle className='h-4 w-4' />
                      )}
                      Reject
                    </Button>
                  </>
                )}
                {selectedMentor.verificationStatus === 'REJECTED' && (
                  <>
                    <Button
                      size='sm'
                      className='gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700'
                      onClick={() =>
                        handleStatusChange(selectedMentor.id, 'VERIFIED', '', {
                          enableCoupon: selectedMentorCouponEnabled,
                        })
                      }
                      disabled={isProcessing(selectedMentor.id)}
                    >
                      {isProcessing(selectedMentor.id) && pendingAction?.status === 'VERIFIED' ? (
                        <Loader2 className='h-4 w-4 animate-spin' />
                      ) : (
                        <CheckCircle2 className='h-4 w-4' />
                      )}
                      Approve
                    </Button>
                  </>
                )}
              </section>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      <AdminDirectMessageDialog
        open={!!messageRecipient}
        onOpenChange={(open) => {
          if (!open) {
            setMessageRecipient(null);
          }
        }}
        recipientId={messageRecipient?.userId ?? null}
        recipientName={
          messageRecipient?.name ||
          messageRecipient?.fullName ||
          'this mentor'
        }
        recipientRoleLabel='mentor'
      />
    </div>
  );
}
