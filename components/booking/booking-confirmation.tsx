"use client"

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Calendar,
  Clock,
  Video,
  MessageSquare,
  Headphones,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { PaymentForm } from './PaymentForm';

interface Mentor {
  id: string;
  userId: string;
  fullName?: string;
  title?: string;
  company?: string;
  hourlyRate?: number;
  currency?: string;
}

interface BookingData {
  scheduledAt: Date;
  sessionType: 'FREE' | 'PAID' | 'COUNSELING';
  duration: number;
  meetingType: 'video' | 'audio' | 'chat';
  title: string;
  description?: string;
  location?: string;
}

interface BookingConfirmationProps {
  bookingData: BookingData;
  mentor: Mentor;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  bookingSource?: 'ai' | 'explore' | 'default';
  aiSpecialRate?: number | null;
  aiSpecialCurrency?: string | null;
}

const MEETING_TYPE_ICONS = {
  video: Video,
  audio: Headphones,
  chat: MessageSquare,
};

const MEETING_TYPE_LABELS = {
  video: 'Video Call',
  audio: 'Audio Call',
  chat: 'Text Chat',
};

const SESSION_TYPE_LABELS: Record<BookingData['sessionType'], string> = {
  FREE: 'Free Intro Session',
  PAID: 'Paid Session',
  COUNSELING: 'Counseling Session',
};

export function BookingConfirmation({ 
  bookingData, 
  mentor, 
  onConfirm, 
  onBack, 
  isSubmitting,
  bookingSource = 'default',
  aiSpecialRate = null,
  aiSpecialCurrency = null,
}: BookingConfirmationProps) {
  const [showPolicy, setShowPolicy] = useState(false);
  const mentorHourlyRateValue = mentor.hourlyRate ? Number(mentor.hourlyRate) : 0;
  const sessionHours = bookingData.duration / 60;
  const basePrice = mentorHourlyRateValue * sessionHours;
  const isFreeSession = bookingData.sessionType === 'FREE';
  const hasAiPlanPricing =
    bookingSource === 'ai' &&
    bookingData.sessionType === 'PAID' &&
    typeof aiSpecialRate === 'number' &&
    aiSpecialRate > 0;
  const planTotal = hasAiPlanPricing ? aiSpecialRate * sessionHours : null;
  const displayTotal = isFreeSession
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

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const MeetingIcon = MEETING_TYPE_ICONS[bookingData.meetingType];

  return (
    <>
      <div className="flex h-full flex-col px-5 pb-5 pt-2">
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
            <div className="border-b border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Review & confirm
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                    {bookingData.title}
                  </h3>
                </div>
                <div className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {bookingData.duration} min
                </div>
              </div>
            </div>

            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Date & time
                  </span>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {format(bookingData.scheduledAt, 'MMM d, yyyy')}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {format(bookingData.scheduledAt, 'h:mm a')}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Format
                  </span>
                  <div className="flex items-center gap-2">
                    <MeetingIcon className="h-4 w-4 text-gray-500" />
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {MEETING_TYPE_LABELS[bookingData.meetingType]}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Session type
                  </span>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {SESSION_TYPE_LABELS[bookingData.sessionType]}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Mentor
                  </span>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {mentor.fullName}
                  </p>
                  <p className="text-xs text-gray-500">{mentor.title}</p>
                </div>
              </div>

              {bookingData.description && (
                <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
                    Additional details
                  </p>
                  <p className="line-clamp-3">{bookingData.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid content-start gap-4">
            {(mentor.hourlyRate || isFreeSession || planTotal !== null) && (
              <Card className="border-slate-200 dark:border-slate-800">
                <CardContent className="space-y-3 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Session cost</span>
                    <span
                      className={hasAiPlanPricing ? 'text-slate-400 line-through' : 'font-medium'}
                    >
                      {formatCurrency(
                        isFreeSession ? 0 : basePrice,
                        mentor.currency
                      )}
                    </span>
                  </div>
                  {hasAiPlanPricing && planTotal !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">AI plan rate</span>
                      <span className="font-medium text-blue-600">
                        {formatCurrency(planTotal, displayCurrency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Service fee</span>
                    <span className="font-medium">
                      {formatCurrency(0, displayCurrency)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-end justify-between">
                    <span className="font-bold">Total</span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(displayTotal, displayCurrency)}
                    </span>
                  </div>
                  {hasAiPlanPricing && savings > 0 && (
                    <p className="text-xs font-semibold text-green-600">
                      You save {formatCurrency(savings, displayCurrency)} with your plan rate
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {bookingData.sessionType !== 'FREE' && <PaymentForm />}

            <button
              type="button"
              onClick={() => setShowPolicy(true)}
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
              <span>
                <span className="block text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Cancellation policy
                </span>
                <span className="block text-xs text-amber-700 dark:text-amber-300/80">
                  Review before confirming
                </span>
              </span>
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-800">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-gray-500 hover:text-gray-900"
            disabled={isSubmitting}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <Button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="bg-blue-600 px-8 text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Processing...</span>
              </div>
            ) : (
              <span>Confirm Booking</span>
            )}
          </Button>
        </div>
      </div>

      <AlertDialog open={showPolicy} onOpenChange={setShowPolicy}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancellation policy</AlertDialogTitle>
            <AlertDialogDescription>
              You can reschedule or cancel for free up to 24 hours before the
              session. Late cancellations may be subject to a fee.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Understood</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
