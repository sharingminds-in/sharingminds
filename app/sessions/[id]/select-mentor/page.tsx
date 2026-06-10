"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MenteeFeaturePageGate } from "@/components/mentee/access/mentee-feature-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    ArrowLeft,
    Calendar,
    Clock,
    DollarSign,
    CheckCircle,
    Loader2,
    User,
    AlertTriangle,
    RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { TimeSlotSelectorV2 } from "@/components/booking/time-slot-selector-v2";
import { useAuth } from "@/contexts/auth-context";
import {
    useAlternativeMentorsQuery,
    useRejectReassignmentMutation,
    useSelectAlternativeMentorMutation,
} from "@/hooks/queries/use-booking-queries";
import {
    getMenteeFeatureDecision,
    MENTEE_FEATURE_KEYS,
} from "@/lib/mentee/access-policy";
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

interface AlternativeMentor {
    id: string;
    userId: string;
    name: string;
    avatar?: string;
    expertise: string[];
    hourlyRate: number;
    isAvailableAtOriginalTime: boolean;
}

interface SessionData {
    mentors: AlternativeMentor[];
    originalScheduledAt: string;
    originalDuration: number;
    sessionTitle: string;
    fixedTime: boolean;
}

export default function SelectMentorPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const { session, menteeAccess } = useAuth();
    const sessionId = params.id as string;
    const sessionsAccess = getMenteeFeatureDecision(
        menteeAccess,
        MENTEE_FEATURE_KEYS.sessionsView
    );
    const canViewSessions = Boolean(sessionsAccess?.allowed);
    const queryUserId = canViewSessions ? session?.user?.id : undefined;

    const [selectedMentor, setSelectedMentor] = useState<AlternativeMentor | null>(null);
    const [selectedTime, setSelectedTime] = useState<Date | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    // Determine if this is fixed time (auto-reassigned) or flexible (no mentor found)
    const [fixedTimeMode, setFixedTimeMode] = useState(true);
    const fixedTimeQuery = useAlternativeMentorsQuery(sessionId, queryUserId, true);
    const flexibleTimeQuery = useAlternativeMentorsQuery(
        sessionId,
        queryUserId,
        false
    );
    const selectAlternativeMentorMutation = useSelectAlternativeMentorMutation();
    const rejectReassignmentMutation = useRejectReassignmentMutation();

    useEffect(() => {
        if (!fixedTimeQuery.isSuccess) {
            return;
        }

        const hasFixedTimeMentors =
            fixedTimeQuery.data.mentors.length > 0 &&
            fixedTimeQuery.data.mentors.some((mentor) => mentor.isAvailableAtOriginalTime);

        setFixedTimeMode(hasFixedTimeMentors);
    }, [fixedTimeQuery.data, fixedTimeQuery.isSuccess]);

    const loading = fixedTimeMode
        ? fixedTimeQuery.isLoading
        : flexibleTimeQuery.isLoading;
    const sessionData = (fixedTimeMode ? fixedTimeQuery.data : flexibleTimeQuery.data) as SessionData | undefined;

    const handleSelectMentor = async () => {
        if (!selectedMentor) return;

        // For flexible mode, require time selection
        if (!fixedTimeMode && !selectedTime) {
            toast({
                title: "Select a Time",
                description: "Please select a time slot for your session",
                variant: "destructive",
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const body: Record<string, string> = {
                newMentorId: selectedMentor.userId,
            };

            if (!fixedTimeMode && selectedTime) {
                body.scheduledAt = selectedTime.toISOString();
            }

            await selectAlternativeMentorMutation.mutateAsync({
                bookingId: sessionId,
                newMentorId: body.newMentorId,
                scheduledAt: body.scheduledAt,
            });

            toast({
                title: "✅ Session Confirmed!",
                description: `Your session has been assigned to ${selectedMentor.name}.`,
                duration: 5000,
            });

            router.push('/dashboard?section=sessions');
        } catch (error) {
            console.error('Error selecting mentor:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to select mentor",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancelSession = async () => {
        setIsCancelling(true);
        try {
            await rejectReassignmentMutation.mutateAsync({
                bookingId: sessionId,
                reason: 'No suitable mentor found',
            });

            toast({
                title: "✅ Session Cancelled",
                description: "Your session has been cancelled. A full refund will be processed.",
                duration: 5000,
            });

            router.push('/dashboard?section=sessions');
        } catch (error) {
            console.error('Error cancelling:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to cancel session",
                variant: "destructive",
            });
        } finally {
            setIsCancelling(false);
            setShowCancelDialog(false);
        }
    };

    if (session && sessionsAccess && !sessionsAccess.allowed) {
        return (
            <div className="mx-auto w-full max-w-6xl p-6">
                <MenteeFeaturePageGate
                    feature={MENTEE_FEATURE_KEYS.sessionsView}
                    access={sessionsAccess}
                    routeBasePath="/dashboard"
                />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="container max-w-4xl mx-auto py-8 px-4">
                <Skeleton className="h-8 w-48 mb-4" />
                <Skeleton className="h-24 w-full mb-6" />
                <div className="grid gap-4 md:grid-cols-2">
                    <Skeleton className="h-48" />
                    <Skeleton className="h-48" />
                    <Skeleton className="h-48" />
                </div>
            </div>
        );
    }

    if (!sessionData) {
        return (
            <div className="container max-w-4xl mx-auto py-8 px-4 text-center">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold mb-2">Session Not Found</h1>
                <p className="text-muted-foreground mb-4">
                    This session may have been cancelled or is no longer available.
                </p>
                <Button onClick={() => router.push('/dashboard?section=sessions')}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Sessions
                </Button>
            </div>
        );
    }

    const originalTime = new Date(sessionData.originalScheduledAt);

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4">
            {/* Header */}
            <div className="mb-6">
                <Button
                    variant="ghost"
                    onClick={() => router.push('/dashboard?section=sessions')}
                    className="mb-4"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Sessions
                </Button>
                <h1 className="text-2xl font-bold">Select a New Mentor</h1>
                <p className="text-muted-foreground">
                    Your original mentor cancelled. Choose a new mentor to continue your session.
                </p>
            </div>

            {/* Session Info Card */}
            <Card className="mb-6 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                                {sessionData.sessionTitle}
                            </h3>
                            <div className="flex flex-wrap gap-4 mt-2 text-sm text-amber-800 dark:text-amber-200">
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    {format(originalTime, "MMMM d, yyyy")}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="h-4 w-4" />
                                    {format(originalTime, "h:mm a")} ({sessionData.originalDuration} min)
                                </span>
                            </div>
                            {!fixedTimeMode && (
                                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                                    No mentors available at the original time. You can choose a different time slot below.
                                </p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Mentor Grid */}
            {sessionData.mentors.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 mb-6">
                    {sessionData.mentors
                        .filter(m => fixedTimeMode ? m.isAvailableAtOriginalTime : true)
                        .map((mentor) => (
                            <Card
                                key={mentor.id}
                                className={`cursor-pointer transition-all ${selectedMentor?.id === mentor.id
                                    ? 'ring-2 ring-primary border-primary'
                                    : 'hover:border-primary/50'
                                    }`}
                                onClick={() => {
                                    setSelectedMentor(mentor);
                                    setSelectedTime(null); // Reset time when switching mentors
                                }}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-3">
                                        <Avatar className="h-12 w-12">
                                            <AvatarImage src={mentor.avatar} alt={mentor.name} />
                                            <AvatarFallback>
                                                <User className="h-6 w-6" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <h3 className="font-semibold truncate">{mentor.name}</h3>
                                                {selectedMentor?.id === mentor.id && (
                                                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                                                <DollarSign className="h-3 w-3" />
                                                ${mentor.hourlyRate}/hr
                                            </div>
                                            {Array.isArray(mentor.expertise) && mentor.expertise.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {mentor.expertise.slice(0, 3).map((skill, i) => (
                                                        <Badge key={i} variant="secondary" className="text-xs">
                                                            {skill}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {fixedTimeMode && mentor.isAvailableAtOriginalTime && (
                                                <Badge className="mt-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                                    Available at original time
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                </div>
            ) : (
                <Card className="mb-6">
                    <CardContent className="p-8 text-center">
                        <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Mentors Available</h3>
                        <p className="text-muted-foreground">
                            Unfortunately, no alternative mentors are available at this time.
                            You can cancel for a full refund.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Time Slot Selector (for flexible mode) */}
            {!fixedTimeMode && selectedMentor && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="text-lg">Select a Time with {selectedMentor.name}</CardTitle>
                        <CardDescription>
                            Choose an available time slot for your session
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <TimeSlotSelectorV2
                            mentorId={selectedMentor.userId}
                            onTimeSelected={(time) => setSelectedTime(time)}
                            initialSelectedTime={undefined}
                        />
                        {selectedTime && (
                            <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                                <p className="text-sm text-green-800 dark:text-green-200">
                                    Selected: {format(selectedTime, "EEEE, MMMM d 'at' h:mm a")}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
                <Button
                    onClick={handleSelectMentor}
                    disabled={!selectedMentor || (!fixedTimeMode && !selectedTime) || isSubmitting}
                    className="flex-1"
                    size="lg"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Confirming...
                        </>
                    ) : (
                        <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirm {selectedMentor?.name ? `with ${selectedMentor.name}` : 'Selection'}
                        </>
                    )}
                </Button>
                <Button
                    variant="outline"
                    onClick={() => setShowCancelDialog(true)}
                    className="sm:w-auto border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                    size="lg"
                >
                    Cancel Session (Full Refund)
                </Button>
            </div>

            {/* Cancel Confirmation Dialog */}
            <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Session?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to cancel this session? You will receive a full refund.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isCancelling}>Keep Browsing</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleCancelSession();
                            }}
                            disabled={isCancelling}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isCancelling ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Cancelling...
                                </>
                            ) : (
                                "Yes, Cancel Session"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
