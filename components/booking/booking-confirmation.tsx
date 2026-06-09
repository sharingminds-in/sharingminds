"use client"

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
  CreditCard,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';

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
  const [policyAccepted, setPolicyAccepted] = useState(false);
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
      <div className="flex h-full min-h-0 flex-col">
        <div className="grid min-h-0 flex-1 content-center gap-2 p-2 sm:gap-3 sm:p-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:p-4">
          <Card className="h-fit overflow-hidden border-border/80">
            <div className="border-b border-border/70 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Session topic
                  </p>
                  <h3 className="mt-0.5 line-clamp-1 text-base font-semibold text-foreground">
                    {bookingData.title}
                  </h3>
                </div>
                <div className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {bookingData.duration} min
                </div>
              </div>
            </div>

            <CardContent className="space-y-2.5 p-3 sm:space-y-3 sm:p-4">
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Date & time
                  </span>
                  <p className="text-xs font-semibold text-foreground">
                    {format(bookingData.scheduledAt, 'MMM d, yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(bookingData.scheduledAt, 'h:mm a')}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Format
                  </span>
                  <div className="flex items-center gap-1.5">
                    <MeetingIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground">
                      {MEETING_TYPE_LABELS[bookingData.meetingType]}
                    </p>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Session type
                  </span>
                  <p className="text-xs font-semibold text-foreground">
                    {SESSION_TYPE_LABELS[bookingData.sessionType]}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Mentor
                  </span>
                  <p className="truncate text-xs font-semibold text-foreground">
                    {mentor.fullName}
                  </p>
                  <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{mentor.title}</p>
                </div>
              </div>

              {bookingData.description && (
                <>
                  <Separator />
                  <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider">
                      Additional details
                    </p>
                    <p className="line-clamp-1 sm:line-clamp-2">{bookingData.description}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit border-border/80">
            <CardContent className="space-y-3 p-3 sm:p-4">
              {(mentor.hourlyRate || isFreeSession || planTotal !== null) && (
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Session cost</span>
                    <span
                      className={hasAiPlanPricing ? 'text-muted-foreground line-through' : 'font-medium'}
                    >
                      {formatCurrency(
                        isFreeSession ? 0 : basePrice,
                        mentor.currency
                      )}
                    </span>
                  </div>
                  {hasAiPlanPricing && planTotal !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">AI plan rate</span>
                      <span className="font-medium text-blue-600">
                        {formatCurrency(planTotal, displayCurrency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Service fee</span>
                    <span className="font-medium">
                      {formatCurrency(0, displayCurrency)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-end justify-between">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(displayTotal, displayCurrency)}
                    </span>
                  </div>
                  {hasAiPlanPricing && savings > 0 && (
                    <p className="text-xs font-semibold text-green-600">
                      You save {formatCurrency(savings, displayCurrency)} with your plan rate
                    </p>
                  )}
                </div>
              )}

              {bookingData.sessionType !== 'FREE' && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CreditCard className="h-4 w-4 text-blue-600" />
                      Secure checkout
                    </div>
                    <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      Payment opens after confirmation and is collected by Razorpay.
                    </div>
                    <div className="flex items-center text-[11px] text-muted-foreground">
                      <Lock className="mr-1.5 h-3 w-3" />
                      Card, UPI, and wallet supported
                    </div>
                  </div>
                </>
              )}

              <Separator />
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2.5">
                  <Checkbox
                    id="accept-cancellation-policy"
                    checked={policyAccepted}
                    onCheckedChange={(checked) => setPolicyAccepted(checked === true)}
                    className="h-5 w-5 rounded-md border-2 border-muted-foreground/60 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
                  />
                  <Label
                    htmlFor="accept-cancellation-policy"
                    className="cursor-pointer text-sm font-semibold leading-none text-foreground"
                  >
                    I accept the cancellation policy
                  </Label>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPolicy(true)}
                  className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  Review policy
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex h-16 shrink-0 items-center justify-between border-t border-border/70 bg-card/30 px-4">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
            disabled={isSubmitting}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <Button
            onClick={onConfirm}
            disabled={isSubmitting || !policyAccepted}
            className="bg-blue-600 px-6 text-white transition-colors hover:bg-blue-700"
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
