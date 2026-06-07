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
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { DollarSign, CheckCircle, X, ChevronRight, Star } from 'lucide-react';
import { TimeSlotSelectorV2 } from './time-slot-selector-v2';
import { BookingForm } from './booking-form';
import { BookingConfirmation } from './booking-confirmation';
import { useAuth } from '@/contexts/auth-context';
import { parseExpertise } from '@/lib/utils/safe-json';
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
  const { limitAmount: aiSpecialRate } = useSubscriptionFeatureLimitAmount(
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
          // Added [&>button]:hidden to hide the default shadcn close button
          className="h-[min(760px,calc(100svh-1rem))] w-[calc(100vw-1rem)] max-w-6xl overflow-hidden rounded-2xl border-0 p-0 shadow-large md:h-[min(760px,calc(100vh-2rem))] [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Book a session</DialogTitle>
            <DialogDescription>
              Choose a time, session details, and confirm your booking.
            </DialogDescription>
          </DialogHeader>
          <div className="flex h-full">

            {/* LEFT SIDEBAR: Mentor Context */}
            <div className="hidden h-full w-72 flex-col border-r border-border bg-secondary dark:bg-card lg:flex">
              <div className="flex h-full flex-col p-6">

                {/* Avatar & Basic Info */}
                <div className="mb-5 text-center">
                  <div className="relative mx-auto mb-3 h-20 w-20">
                    <Avatar className="w-full h-full border-4 border-background shadow-md">
                      <AvatarImage src={mentor.profileImageUrl} />
                      <AvatarFallback className="text-2xl bg-indigo-500 text-white">
                        {mentor.fullName?.charAt(0) || 'M'}
                      </AvatarFallback>
                    </Avatar>
                    {/* Rating Badge */}
                    <div className="absolute -bottom-2 -right-2 bg-background py-1 px-2 rounded-full shadow-subtle border border-border flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span className="text-xs font-bold text-foreground">5.0</span>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold leading-tight text-foreground">
                    {mentor.fullName}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {mentor.title} {mentor.company && `at ${mentor.company}`}
                  </p>
                </div>

                <Separator className="mb-5 bg-border" />

                {/* Hourly Rate */}
                <div className="mb-5 rounded-xl border border-border bg-card p-4 shadow-subtle">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Session Rate</p>
                  <div className="flex items-end gap-1">
                    <span className="text-2xl font-bold text-foreground">{formatCurrency(mentor.hourlyRate, mentor.currency)}</span>
                    <span className="text-sm text-muted-foreground mb-1">/ hour</span>
                  </div>
                </div>

                {/* Expertise Tags */}
                {mentor.expertise && (
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Core Expertise</p>
                    <div className="flex flex-wrap gap-2">
                      {parseExpertise(mentor.expertise).slice(0, 5).map((skill: string, index: number) => (
                        <Badge key={index} variant="secondary" className="bg-card hover:bg-card border border-border text-muted-foreground font-normal">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-5 text-center text-xs text-muted-foreground">
                  Powered by <span className="font-semibold text-foreground">SharingMinds</span>
                </div>
              </div>
            </div>

            {/* RIGHT CONTENT: Wizard Steps */}
            <div className="relative flex min-w-0 flex-1 flex-col bg-background">

              {/* Custom Close Button */}
              <button
                onClick={handleAttemptClose}
                className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors z-10 rounded-full hover:bg-muted"
                aria-label="Close booking modal"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Step Indicator */}
              {currentStep !== 'success' && (
                <div className="px-6 pb-2 pt-5">
                  <div className="relative mx-auto flex max-w-sm items-center justify-between">
                    {/* Background Line */}
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -z-10" />

                    {STEPS.map((step, idx) => {
                      const isActive = step.id === currentStep;
                      const isCompleted = STEPS.findIndex(s => s.id === currentStep) > idx;

                      return (
                        <div key={step.id} className="flex flex-col items-center gap-2 bg-background px-2">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300",
                            isActive ? "border-primary bg-primary text-primary-foreground scale-110" :
                              isCompleted ? "border-primary bg-background text-primary" :
                                "border-border text-muted-foreground bg-background"
                          )}>
                            {isCompleted ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                          </div>
                          <span className={cn(
                            "text-xs font-medium transition-colors duration-300",
                            isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {currentStep !== 'success' && (
                <div className="px-5 pb-3 text-center">
                  <h2 className="text-xl font-bold text-foreground">
                    {STEP_TITLES[currentStep]}
                  </h2>
                </div>
              )}

              {/* Step Content Area */}
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
                      <div className="h-full px-5 pb-5 pt-1">
                        <TimeSlotSelectorV2
                          mentorId={mentor.userId}
                          onTimeSelected={handleTimeSelection}
                          initialSelectedTime={bookingData.scheduledAt}
                        />
                      </div>
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
                      />
                    </motion.div>
                  )}

                  {currentStep === 'success' && bookingId && (
                    <motion.div
                      key="step-success"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="h-full flex flex-col items-center justify-center p-8 text-center"
                    >
                      <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6 animate-bounce">
                        <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-500" />
                      </div>
                      <h2 className="text-3xl font-bold text-foreground mb-2">Booking Confirmed!</h2>
                      <p className="text-muted-foreground max-w-md mx-auto mb-8 text-lg">
                        Your session has been scheduled. Check your email for the calendar invite and meeting link.
                      </p>
                      <div className="flex gap-4">
                        <Button variant="outline" onClick={resetState} size="lg">Close</Button>
                        <Button onClick={() => window.location.href = '/dashboard?section=sessions'} size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
                          View My Sessions
                        </Button>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
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
