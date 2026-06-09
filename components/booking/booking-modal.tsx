"use client"

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, CheckCircle, X } from 'lucide-react';
import { TimeSlotSelectorV2 } from './time-slot-selector-v2';
import { BookingForm } from './booking-form';
import { BookingConfirmation } from './booking-confirmation';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useCreateBookingMutation } from '@/hooks/queries/use-booking-queries';
import { useSubscriptionFeatureLimitAmount } from '@/hooks/queries/use-subscription-queries';
import { useTRPCClient } from '@/lib/trpc/react';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';
import { useRazorpayCheckout } from '@/hooks/use-razorpay-checkout';
import type { PaymentCheckoutPayload } from '@/lib/payments/types';

interface Mentor {
  id: string;
  userId: string;
  fullName?: string;
  title?: string;
  company?: string;
  profileImageUrl?: string;
  hourlyRate?: number;
  currency?: string;
  about?: string;
  expertise?: string;
}

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  mentor: Mentor;
  allowFreeBooking?: boolean;
  bookingSource?: 'ai' | 'explore';
}

type BookingStep = 'time-selection' | 'details' | 'confirmation' | 'success';

interface BookingData {
  scheduledAt: Date;
  sessionType: 'FREE' | 'PAID' | 'COUNSELING';
  duration: number;
  meetingType: 'video' | 'audio' | 'chat';
  title: string;
  description?: string;
  location?: string;
}

export function BookingModal({
  isOpen,
  onClose,
  mentor,
  allowFreeBooking = true,
  bookingSource = allowFreeBooking ? 'ai' : 'explore',
}: BookingModalProps) {
  const trpcClient = useTRPCClient();
  const { session } = useAuth();
  const [currentStep, setCurrentStep] = useState<BookingStep>('time-selection');
  const [bookingData, setBookingData] = useState<Partial<BookingData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string>();
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [sessionAvailability, setSessionAvailability] = useState<{
    freeAvailable: boolean;
    paidAvailable: boolean;
    freeRemaining?: number | null;
    paidRemaining?: number | null;
    mentorSessionsRemaining?: number | null;
  } | null>(null);
  const createBookingMutation = useCreateBookingMutation();
  const openPaymentCheckout = useRazorpayCheckout();
  const {
    limitAmount: aiSpecialRate,
    limitCurrency: aiSpecialCurrency,
  } = useSubscriptionFeatureLimitAmount(
    'mentee',
    FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
    isOpen && bookingSource === 'ai'
  );

  // Steps definition for UI mapping
  const STEPS = [
    { id: 'time-selection', label: 'Time' },
    { id: 'details', label: 'Details' },
    { id: 'confirmation', label: 'Confirm' }
  ];
  const STEP_TITLES: Record<Exclude<BookingStep, 'success'>, string> = {
    'time-selection': 'Select a Date & Time',
    details: 'Session Details',
    confirmation: 'Review & Confirm',
  };

  const resetState = () => {
    // Small timeout to allow modal close animation to start before resetting state
    setTimeout(() => {
      setCurrentStep('time-selection');
      setBookingData({});
      setBookingId(undefined);
    }, 300);
    onClose();
  };

  useEffect(() => {
    if (!isOpen || !mentor?.userId) return;
    if (!allowFreeBooking) {
      setSessionAvailability({
        freeAvailable: false,
        paidAvailable: true,
      });
      return;
    }

    const loadAvailability = async () => {
      try {
        setAvailabilityLoading(true);
        const data = await trpcClient.mentor.bookingEligibility.query({
          mentorUserId: mentor.userId,
        });
        setSessionAvailability({
          freeAvailable: Boolean(data.data?.free_available),
          paidAvailable: Boolean(data.data?.paid_available),
          freeRemaining: data.data?.free_remaining ?? null,
          paidRemaining: data.data?.paid_remaining ?? null,
          mentorSessionsRemaining: (data.data as any)?.mentor_sessions_remaining ?? null,
        });
      } catch (error) {
        setSessionAvailability({
          freeAvailable: true,
          paidAvailable: true,
          freeRemaining: null,
          paidRemaining: null,
          mentorSessionsRemaining: null,
        });
      } finally {
        setAvailabilityLoading(false);
      }
    };

    loadAvailability();
  }, [allowFreeBooking, isOpen, mentor?.userId, trpcClient]);

  const effectiveAvailability = sessionAvailability
    ? {
        freeAvailable: allowFreeBooking ? sessionAvailability.freeAvailable : false,
        paidAvailable: sessionAvailability.paidAvailable,
        freeRemaining: sessionAvailability.freeRemaining ?? null,
        paidRemaining: sessionAvailability.paidRemaining ?? null,
        mentorSessionsRemaining: sessionAvailability.mentorSessionsRemaining ?? null,
      }
    : allowFreeBooking
      ? null
      : {
          freeAvailable: false,
          paidAvailable: true,
          freeRemaining: null,
          paidRemaining: null,
          mentorSessionsRemaining: null,
        };

  const handleAttemptClose = () => {
    if (currentStep === 'time-selection' && !bookingData.scheduledAt) {
      resetState();
    } else if (currentStep === 'success') {
      resetState();
    } else {
      setIsCloseConfirmOpen(true);
    }
  };

  const handleConfirmClose = () => {
    setIsCloseConfirmOpen(false);
    resetState();
  };

  const handleTimeSelection = (scheduledAt: Date) => {
    setBookingData(prev => ({ ...prev, scheduledAt }));
    setCurrentStep('details');
  };

  const handleBookingDetails = (details: Omit<BookingData, 'scheduledAt'>) => {
    setBookingData(prev => ({ ...prev, ...details }));
    setCurrentStep('confirmation');
  };

  const handleConfirmBooking = async () => {
    if (!session) {
      toast.error('Please log in to book a session');
      return;
    }

    setIsSubmitting(true);

    try {
      const bookingPayload = {
        mentorId: mentor.userId,
        bookingSource,
        sessionType: bookingData.sessionType!,
        title: bookingData.title!,
        description: bookingData.description,
        scheduledAt: bookingData.scheduledAt!.toISOString(),
        duration: bookingData.duration!,
        meetingType: bookingData.meetingType!,
        location: bookingData.location,
      };

      if (bookingPayload.sessionType === 'PAID') {
        const payment = (await trpcClient.payments.startSessionBooking.mutate(
          bookingPayload
        )) as PaymentCheckoutPayload;
        const result = await openPaymentCheckout(payment);
        const resource =
          'resource' in result ? result.resource : null;

        if (resource?.type !== 'session' || !resource.id) {
          throw new Error('Payment completed but the session is still processing.');
        }

        setBookingId(resource.id);
        setCurrentStep('success');
        toast.success('Session booked successfully!');
        return;
      }

      const data = await createBookingMutation.mutateAsync(bookingPayload);

      setBookingId(data.booking.id);
      setCurrentStep('success');
      toast.success('Session booked successfully!');

    } catch (error) {
      console.error('Booking error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to book session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackStep = () => {
    if (currentStep === 'details') setCurrentStep('time-selection');
    else if (currentStep === 'confirmation') setCurrentStep('details');
    else handleAttemptClose();
  };

  const formatCurrency = (amount: number | undefined, currency: string = 'USD') => {
    if (!amount) return 'Free';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleAttemptClose()}>
        <DialogContent
          className="h-[100svh] w-screen max-w-none overflow-hidden rounded-none border-0 p-0 shadow-large sm:h-[min(720px,calc(100svh-1rem))] sm:w-[calc(100vw-1rem)] sm:max-w-6xl sm:rounded-2xl [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Book a session</DialogTitle>
            <DialogDescription>
              Choose a time, session details, and confirm your booking.
            </DialogDescription>
          </DialogHeader>
          <div className="relative flex h-full min-w-0 flex-col bg-background">

            {currentStep === 'success' && (
              <button
                onClick={handleAttemptClose}
                className="absolute right-3 top-3 z-20 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close booking modal"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            {currentStep !== 'success' && (
              <header className="shrink-0 border-b border-border/70 bg-card/40 px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0 border-2 border-background shadow-sm">
                      <AvatarImage src={mentor.profileImageUrl} />
                      <AvatarFallback className="bg-indigo-500 text-sm font-semibold text-white">
                        {mentor.fullName?.charAt(0) || 'M'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {mentor.fullName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {mentor.title || 'Mentor'}
                        <span className="hidden sm:inline">
                          {' / '}
                          {formatCurrency(mentor.hourlyRate, mentor.currency)}/hr
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="hidden min-w-0 flex-1 text-center md:block">
                    <h2 className="truncate text-lg font-semibold text-foreground">
                      {STEP_TITLES[currentStep]}
                    </h2>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-background p-1">
                      {STEPS.map((step, idx) => {
                        const isActive = step.id === currentStep;
                        const isCompleted = STEPS.findIndex(s => s.id === currentStep) > idx;

                        return (
                          <div
                            key={step.id}
                            className={cn(
                              'flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors sm:px-3',
                              isActive
                                ? 'bg-primary text-primary-foreground'
                                : isCompleted
                                  ? 'text-primary'
                                  : 'text-muted-foreground'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold',
                                isActive
                                  ? 'border-primary-foreground/40'
                                  : isCompleted
                                    ? 'border-primary/30 bg-primary/10'
                                    : 'border-border'
                              )}
                            >
                              {isCompleted ? <Check className="h-3 w-3" /> : idx + 1}
                            </span>
                            <span className="hidden sm:inline">{step.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="h-7 w-px bg-border" />
                    <button
                      onClick={handleAttemptClose}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Close booking modal"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-center md:hidden">
                  <h2 className="text-base font-semibold text-foreground">
                    {STEP_TITLES[currentStep]}
                  </h2>
                </div>
              </header>
            )}

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>

                {currentStep === 'time-selection' && (
                  <motion.div
                    key="step-time"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <TimeSlotSelectorV2
                      mentorId={mentor.userId}
                      onTimeSelected={handleTimeSelection}
                      initialSelectedTime={bookingData.scheduledAt}
                    />
                  </motion.div>
                )}

                {currentStep === 'details' && bookingData.scheduledAt && (
                  <motion.div
                    key="step-details"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <BookingForm
                      scheduledAt={bookingData.scheduledAt}
                      mentor={mentor}
                      availability={availabilityLoading ? undefined : effectiveAvailability || undefined}
                      freeDisabledReason={
                        allowFreeBooking
                          ? undefined
                          : 'Free sessions are only available via AI mentor matches.'
                      }
                      hideFreeOption={!allowFreeBooking}
                      hideSessionTypeSelector={!allowFreeBooking}
                      onSubmit={handleBookingDetails}
                      onBack={handleBackStep}
                      initialData={bookingData}
                      bookingSource={bookingSource}
                      aiSpecialRate={aiSpecialRate}
                      aiSpecialCurrency={aiSpecialCurrency}
                    />
                  </motion.div>
                )}

                {currentStep === 'confirmation' && (
                  <motion.div
                    key="step-confirm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <BookingConfirmation
                      bookingData={bookingData as BookingData}
                      mentor={mentor}
                      onConfirm={handleConfirmBooking}
                      onBack={handleBackStep}
                      isSubmitting={isSubmitting}
                      bookingSource={bookingSource}
                      aiSpecialRate={aiSpecialRate}
                      aiSpecialCurrency={aiSpecialCurrency}
                    />
                  </motion.div>
                )}

                {currentStep === 'success' && bookingId && (
                  <motion.div
                    key="step-success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex h-full flex-col items-center justify-center p-8 text-center"
                  >
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-500" />
                    </div>
                    <h2 className="mb-2 text-2xl font-bold text-foreground">Booking Confirmed!</h2>
                    <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
                      Your session has been scheduled. Check your email for the calendar invite and meeting link.
                    </p>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={resetState}>Close</Button>
                      <Button onClick={() => window.location.href = '/dashboard?section=sessions'}>
                        View My Sessions
                      </Button>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Confirmation Dialog */}
      <AlertDialog open={isCloseConfirmOpen} onOpenChange={setIsCloseConfirmOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Abandon Booking?</AlertDialogTitle>
            <AlertDialogDescription>
              You are in the middle of booking a session. If you leave now, your progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsCloseConfirmOpen(false)}>Continue Booking</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="bg-red-600 hover:bg-red-700 text-white">Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
