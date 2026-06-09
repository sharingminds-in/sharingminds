"use client"

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Clock, Video, Headphones, MessageSquare, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Mentor {
  id: string;
  userId: string;
  fullName?: string;
  title?: string;
  company?: string;
  hourlyRate?: number;
  currency?: string;
}

interface BookingAvailability {
  freeAvailable: boolean;
  paidAvailable: boolean;
  freeRemaining?: number | null;
  paidRemaining?: number | null;
  mentorSessionsRemaining?: number | null;
}

interface BookingFormProps {
  scheduledAt: Date;
  mentor: Mentor;
  availability?: BookingAvailability;
  freeDisabledReason?: string;
  hideFreeOption?: boolean;
  hideSessionTypeSelector?: boolean;
  onSubmit: (data: {
    sessionType: 'FREE' | 'PAID' | 'COUNSELING';
    duration: number;
    meetingType: 'video' | 'audio' | 'chat';
    title: string;
    description?: string;
    location?: string;
  }) => void;
  onBack: () => void;
  initialData?: Partial<{
    sessionType: 'FREE' | 'PAID' | 'COUNSELING';
    duration: number;
    meetingType: 'video' | 'audio' | 'chat';
    title: string;
    description?: string;
    location?: string;
  }>;
  bookingSource?: 'ai' | 'explore' | 'default';
  aiSpecialRate?: number | null;
  aiSpecialCurrency?: string | null;
}

const MEETING_TYPES = [
  { value: 'video', label: 'Video Call', icon: Video, description: 'Google Meet / Zoom' },
  { value: 'audio', label: 'Audio Call', icon: Headphones, description: 'Voice-only discussion' },
  { value: 'chat', label: 'Text Chat', icon: MessageSquare, description: 'Real-time messaging' },
] as const;

const DURATION_OPTIONS = [
  { value: 30, label: '30 min', price: 0.5 },
  { value: 45, label: '45 min', price: 0.75 },
  { value: 60, label: '60 min', price: 1 },
  { value: 90, label: '90 min', price: 1.5 },
  { value: 120, label: '2 hours', price: 2 },
];

export function BookingForm({
  scheduledAt,
  mentor,
  availability,
  freeDisabledReason,
  hideFreeOption,
  hideSessionTypeSelector,
  onSubmit,
  onBack,
  initialData,
  bookingSource = 'default',
  aiSpecialRate = null,
  aiSpecialCurrency = null,
}: BookingFormProps) {
  const shouldHideSessionTypeSelector = Boolean(hideSessionTypeSelector);
  const freeAvailable = availability?.freeAvailable ?? true;
  const paidAvailable = availability?.paidAvailable ?? true;
  const hasAnyAvailability = freeAvailable || paidAvailable;
  const showFreeOption = !hideFreeOption;
  const freeRemaining = availability?.freeRemaining ?? null;
  const paidRemaining = availability?.paidRemaining ?? null;
  const mentorRemaining = availability?.mentorSessionsRemaining ?? null;

  const initialSessionType = initialData?.sessionType
    || (shouldHideSessionTypeSelector
      ? 'PAID'
      : freeAvailable
        ? 'FREE'
        : 'PAID');
  const allowedInitialDurations =
    initialSessionType === 'FREE'
      ? [30]
      : initialSessionType === 'PAID'
        ? [30, 45]
        : DURATION_OPTIONS.map((option) => option.value);
  const initialDuration =
    initialData?.duration && allowedInitialDurations.includes(initialData.duration)
      ? initialData.duration
      : initialSessionType === 'FREE'
        ? 30
        : 45;

  const [formData, setFormData] = useState({
    sessionType: initialSessionType as 'FREE' | 'PAID' | 'COUNSELING',
    duration: initialDuration,
    meetingType: initialData?.meetingType || 'video' as const,
    title: initialData?.title || '',
    description: initialData?.description || '',
    location: initialData?.location || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) {
      newErrors.title = 'Please provide a topic for the session';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (validateForm()) onSubmit(formData);
  };

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSessionTypeChange = (value: 'FREE' | 'PAID' | 'COUNSELING') => {
    if (value === 'FREE' && !freeAvailable) return;
    if (value === 'PAID' && !paidAvailable) return;

    setFormData(prev => {
      if (value === 'FREE') {
        return { ...prev, sessionType: value, duration: 30 };
      }

      const allowedPaidDurations = [30, 45];
      const nextDuration = allowedPaidDurations.includes(prev.duration) ? prev.duration : 45;
      return { ...prev, sessionType: value, duration: nextDuration };
    });
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  const mentorHourlyRateValue = mentor.hourlyRate ? Number(mentor.hourlyRate) : 0;
  const sessionHours = formData.duration / 60;
  const basePrice = mentorHourlyRateValue * sessionHours;
  const isFreeSession = formData.sessionType === 'FREE';
  const hasAiPlanPricing =
    bookingSource === 'ai' &&
    formData.sessionType === 'PAID' &&
    typeof aiSpecialRate === 'number' &&
    aiSpecialRate > 0;
  const planTotal = hasAiPlanPricing ? aiSpecialRate * sessionHours : null;
  const displayPrice = isFreeSession
    ? 0
    : planTotal !== null
      ? planTotal
      : basePrice;
  const displayCurrency =
    planTotal !== null ? aiSpecialCurrency || mentor.currency : mentor.currency;
  const savings =
    planTotal !== null && displayCurrency === mentor.currency
      ? Math.max(0, basePrice - planTotal)
      : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 lg:p-5">
        <div className="grid w-full max-w-5xl items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="border-border/80 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <form id="booking-form" onSubmit={handleSubmit}>
                <div className="pb-3">
                  <p className="text-base font-semibold text-foreground">
                    Customize your session
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Set the length, format, and focus for this conversation.
                  </p>
                </div>

                {!shouldHideSessionTypeSelector && (
                  <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3 border-t border-border/70 py-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <div>
                      <Label className="text-xs font-semibold text-foreground">
                        Session type
                      </Label>
                      <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
                        Choose access
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          value: 'FREE',
                          label: 'Free intro',
                          helper: freeAvailable
                            ? '30 minutes'
                            : freeDisabledReason || 'Unavailable',
                          disabled: !freeAvailable,
                        },
                        {
                          value: 'PAID',
                          label: 'Paid session',
                          helper: paidAvailable ? 'Up to 45 minutes' : 'Unavailable',
                          disabled: !paidAvailable,
                        },
                      ]
                        .filter((option) =>
                          option.value === 'FREE' ? showFreeOption : true
                        )
                        .map((option) => {
                          const isSelected = formData.sessionType === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                handleSessionTypeChange(option.value as 'FREE' | 'PAID')
                              }
                              disabled={option.disabled}
                              className={cn(
                                'relative flex h-12 items-center rounded-lg border px-3 text-left transition-all',
                                option.disabled
                                  ? 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground'
                                  : 'hover:border-blue-400',
                                isSelected
                                  ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/20'
                                  : 'border-border bg-background'
                              )}
                            >
                              {isSelected && (
                                <CheckCircle2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-blue-500" />
                              )}
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">
                                  {option.label}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {option.helper}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                    </div>
                    {!hasAnyAvailability && (
                      <p className="text-xs text-red-500">
                        This mentor has no available free or paid sessions right now.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3 border-t border-border/70 py-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Session length
                    </p>
                    <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
                      Select duration
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DURATION_OPTIONS.filter((option) => {
                      if (formData.sessionType === 'FREE') return option.value === 30;
                      if (formData.sessionType === 'PAID') return option.value <= 45;
                      return true;
                    }).map((option) => {
                      const isSelected = formData.duration === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleInputChange('duration', option.value)}
                          className={cn(
                            'relative flex h-12 min-w-0 items-center justify-between rounded-lg border px-3 text-left transition-all hover:border-blue-400',
                            isSelected
                              ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/20'
                              : 'border-border bg-background'
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{option.label}</span>
                            {mentor.hourlyRate && formData.sessionType !== 'FREE' && (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {formatCurrency(mentor.hourlyRate * option.price, mentor.currency)}
                              </span>
                            )}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3 border-t border-border/70 py-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Meeting format
                    </p>
                    <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
                      Choose channel
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {MEETING_TYPES.map((type) => {
                      const Icon = type.icon;
                      const isSelected = formData.meetingType === type.value;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => handleInputChange('meetingType', type.value)}
                          className={cn(
                            'relative flex h-14 min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-2.5 text-left transition-all hover:border-blue-400',
                            isSelected
                              ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/20'
                              : 'border-border bg-background'
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold sm:text-sm">
                              {type.label}
                            </span>
                            <span className="hidden truncate text-[10px] text-muted-foreground sm:block">
                              {type.description}
                            </span>
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-blue-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3 border-t border-border/70 py-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <div>
                    <Label htmlFor="title" className="text-xs font-semibold">
                      Session topic <span className="text-red-500">*</span>
                    </Label>
                    <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
                      Main objective
                    </p>
                  </div>
                  <div>
                    <Input
                      id="title"
                      placeholder="e.g. Interview strategy"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      className={cn(
                        'h-10 border-border bg-background focus:ring-blue-500/20',
                        errors.title ? 'border-red-500 focus-visible:ring-red-200' : ''
                      )}
                    />
                    {errors.title && (
                      <p className="mt-1 text-xs font-medium text-red-500">{errors.title}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-[100px_minmax(0,1fr)] items-start gap-3 border-t border-border/70 pt-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <div className="pt-1">
                    <Label htmlFor="description" className="text-xs font-semibold">
                      Context
                    </Label>
                    <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
                      Optional details
                    </p>
                  </div>
                  <Textarea
                    id="description"
                    placeholder="Share goals, questions, or useful background"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={2}
                    className="min-h-14 resize-none border-border bg-background focus:ring-blue-500/20"
                  />
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="hidden border-border/80 bg-muted/15 shadow-sm lg:block">
            <CardContent className="flex h-full flex-col p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Booking summary
                </p>
                <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    {format(scheduledAt, 'EEE, MMM d, yyyy')}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-blue-500" />
                    {format(scheduledAt, 'h:mm a')}
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Session</span>
                    <span className="font-semibold">
                      {formData.sessionType === 'FREE' ? 'Free intro' : 'Paid'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Length</span>
                    <span className="font-semibold">{formData.duration} min</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Format</span>
                    <span className="font-semibold">
                      {MEETING_TYPES.find((type) => type.value === formData.meetingType)?.label}
                    </span>
                  </div>
                  {freeRemaining !== null && formData.sessionType === 'FREE' && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Free sessions left</span>
                      <span className="font-semibold">{freeRemaining}</span>
                    </div>
                  )}
                  {mentorRemaining !== null && formData.sessionType === 'PAID' && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Mentor sessions left</span>
                      <span className="font-semibold">{mentorRemaining}</span>
                    </div>
                  )}
                  {paidRemaining !== null && formData.sessionType === 'PAID' && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Paid quota left</span>
                      <span className="font-semibold">{paidRemaining}</span>
                    </div>
                  )}
                </div>
              </div>

              {(mentor.hourlyRate || isFreeSession || planTotal !== null) && (
                <div className="mt-auto border-t border-border/70 pt-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Estimated total</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {isFreeSession
                          ? 'No charge'
                          : `${formData.duration} min session`}
                      </p>
                    </div>
                    <div className="text-right">
                      {planTotal !== null && (
                        <p className="text-xs text-muted-foreground line-through">
                          {formatCurrency(basePrice, mentor.currency)}
                        </p>
                      )}
                      <p className="text-2xl font-bold">
                        {formatCurrency(displayPrice, displayCurrency)}
                      </p>
                    </div>
                  </div>
                  {planTotal !== null && savings > 0 && (
                    <p className="mt-2 text-xs font-semibold text-green-600">
                      Save {formatCurrency(savings, mentor.currency)} with AI booking
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex h-16 shrink-0 items-center justify-between border-t border-border/70 bg-card/30 px-4">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Button
          type="submit"
          form="booking-form"
          className="bg-blue-600 px-6 text-white hover:bg-blue-700"
          disabled={!hasAnyAvailability}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
