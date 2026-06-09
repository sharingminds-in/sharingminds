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
    || (freeAvailable ? 'FREE' : paidAvailable ? 'PAID' : 'PAID');

  const [formData, setFormData] = useState({
    sessionType: initialSessionType as 'FREE' | 'PAID' | 'COUNSELING',
    duration: initialData?.duration || 60,
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
    <div className="flex h-full flex-col px-5 pb-5 pt-2">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
        <form id="booking-form" onSubmit={handleSubmit} className="grid content-start gap-4">
          {!shouldHideSessionTypeSelector && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Session type
              </Label>
              <div className="grid gap-2 md:grid-cols-2">
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
                          "rounded-xl border-2 px-3 py-2 text-left transition-all",
                          option.disabled
                            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40"
                            : "hover:border-blue-300 dark:hover:border-blue-700",
                          isSelected
                            ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-900/20"
                            : "border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900"
                        )}
                      >
                        <span className="block text-sm font-semibold">
                          {option.label}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {option.helper}
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Duration
              </Label>
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
                        "relative rounded-xl border-2 px-3 py-2 text-left transition-all hover:border-blue-300 dark:hover:border-blue-700",
                        isSelected
                          ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-900/20"
                          : "border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900"
                      )}
                    >
                      {isSelected && (
                        <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      )}
                      <span className="block text-sm font-bold">
                        {option.label}
                      </span>
                      {mentor.hourlyRate && formData.sessionType !== 'FREE' && (
                        <span className="block text-xs text-slate-500">
                          {formatCurrency(mentor.hourlyRate * option.price, mentor.currency)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Meeting format
              </Label>
              <div className="grid gap-2">
                {MEETING_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = formData.meetingType === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => handleInputChange('meetingType', type.value)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-all hover:border-blue-300 dark:hover:border-blue-700",
                        isSelected
                          ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-900/20"
                          : "border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900"
                      )}
                    >
                      <Icon className="h-4 w-4 text-slate-500" />
                      <span>
                        <span className="block text-sm font-semibold">
                          {type.label}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {type.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-semibold">
                Session topic <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="What do you want to achieve?"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className={cn(
                  "h-10 border-slate-200 focus:ring-blue-500/20",
                  errors.title ? 'border-red-500 focus-visible:ring-red-200' : ''
                )}
              />
              {errors.title && (
                <p className="text-xs font-medium text-red-500">{errors.title}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-semibold">
                Additional details
              </Label>
              <Textarea
                id="description"
                placeholder="Optional context or questions"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={2}
                className="resize-none border-slate-200 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </form>

        <Card className="h-fit border-slate-200 dark:border-slate-800">
          <CardContent className="space-y-4 p-4">
            <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 dark:border-blue-900/30 dark:from-blue-900/20 dark:to-indigo-900/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">
                Scheduled time
              </p>
              <div className="mt-2 space-y-1 text-sm font-medium">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  {format(scheduledAt, 'EEE, MMM d, yyyy')}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  {format(scheduledAt, 'h:mm a')}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Session type</span>
                <span className="font-medium">{formData.sessionType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{formData.duration} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Format</span>
                <span className="font-medium capitalize">
                  {formData.meetingType}
                </span>
              </div>
              {freeRemaining !== null && formData.sessionType === 'FREE' && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Free sessions left</span>
                  <span className="font-medium">{freeRemaining}</span>
                </div>
              )}
              {mentorRemaining !== null && formData.sessionType === 'PAID' && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Mentor sessions left</span>
                  <span className="font-medium">{mentorRemaining}</span>
                </div>
              )}
              {paidRemaining !== null && formData.sessionType === 'PAID' && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Paid quota left</span>
                  <span className="font-medium">{paidRemaining}</span>
                </div>
              )}
            </div>

            {(mentor.hourlyRate || isFreeSession || planTotal !== null) && (
              <div className="rounded-xl border bg-slate-50 p-3 dark:bg-slate-900/50">
                <p className="text-xs text-muted-foreground">Estimated total</p>
                <div className="mt-1 flex items-end justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    {isFreeSession
                      ? 'Free session'
                      : `${formData.duration} mins @ ${formatCurrency(
                          planTotal !== null
                            ? aiSpecialRate ?? mentorHourlyRateValue
                            : mentorHourlyRateValue,
                          displayCurrency
                        )}/hr`}
                  </div>
                  <div className="text-right">
                    {planTotal !== null && (
                      <p className="text-xs text-slate-400 line-through">
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

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <Button 
          type="submit"
          form="booking-form"
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 shadow-lg shadow-blue-500/20"
          disabled={!hasAnyAvailability}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
