"use client"

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Calendar,
    Clock,
    User,
    Video,
    MessageSquare,
    Headphones,
    ChevronLeft,
    ChevronRight,
    Plus,
    RefreshCw,
    XCircle,
    Undo2,
    CheckCircle2,
    X,
    FileText,
    MoreVertical,
    CalendarDays,
    List,
    AlertCircle
} from 'lucide-react';
import {
    format,
    addDays,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameDay,
    isToday,
    setHours,
    isPast,
    addWeeks,
    subWeeks,
    formatDistanceToNow
} from 'date-fns';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SessionLobbyModal } from './SessionLobbyModal';
import { RescheduleResponseDialog } from './reschedule-response-dialog';
import { CancelDialog } from './cancel-dialog';
import { RescheduleDialog } from './reschedule-dialog';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    useBookingsQuery,
    useWithdrawRescheduleRequestMutation,
} from '@/hooks/queries/use-booking-queries';
import { findSessionFromDashboardParams } from '@/lib/bookings/dashboard-session-intent';
import {
    getMentorFeatureDecision,
    MENTOR_FEATURE_KEYS,
} from '@/lib/mentor/access-policy';
import { MentorFeaturePageGate } from '@/components/mentor/verification/mentor-verification-state';

// Feature flags
const ALLOW_WITHDRAW_RESCHEDULE = true;

interface Session {
    id: string;
    title: string;
    description?: string;
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
    scheduledAt: string;
    duration: number;
    meetingType: 'video' | 'audio' | 'chat';
    meetingUrl?: string;
    location?: string;
    mentorId: string;
    menteeId: string;
    menteeName?: string;
    menteeAvatar?: string;
    rate?: number;
    currency?: string;
    rescheduleCount?: number;
    mentorRescheduleCount?: number;
    cancelledBy?: string;
    // Pending reschedule fields
    pendingRescheduleRequestId?: string;
    pendingRescheduleTime?: string;
    pendingRescheduleBy?: 'mentor' | 'mentee';
}

type ViewType = 'week' | 'list';

const MEETING_TYPE_ICONS = {
    video: Video,
    audio: Headphones,
    chat: MessageSquare,
};

const STATUS_COLORS = {
    scheduled: {
        bg: 'bg-blue-200/50 hover:bg-blue-200/40 dark:bg-blue-400/25 dark:hover:bg-blue-400/20',
        text: 'text-blue-900/90 dark:text-blue-200',
        border: 'shadow-blue-700/8'
    },
    in_progress: {
        bg: 'bg-emerald-200/50 hover:bg-emerald-200/40 dark:bg-emerald-400/25 dark:hover:bg-emerald-400/20',
        text: 'text-emerald-900/90 dark:text-emerald-200',
        border: 'shadow-emerald-700/8'
    },
    completed: {
        bg: 'bg-gray-200/50 hover:bg-gray-200/40 dark:bg-gray-400/25 dark:hover:bg-gray-400/20',
        text: 'text-gray-900/90 dark:text-gray-200',
        border: 'shadow-gray-700/8'
    },
    cancelled: {
        bg: 'bg-rose-200/50 hover:bg-rose-200/40 dark:bg-rose-400/25 dark:hover:bg-rose-400/20',
        text: 'text-rose-900/90 dark:text-rose-200',
        border: 'shadow-rose-700/8'
    },
    no_show: {
        bg: 'bg-orange-200/50 hover:bg-orange-200/40 dark:bg-orange-400/25 dark:hover:bg-orange-400/20',
        text: 'text-orange-900/90 dark:text-orange-200',
        border: 'shadow-orange-700/8'
    },
    reschedule_pending: {
        bg: 'bg-amber-200/50 hover:bg-amber-200/40 dark:bg-amber-400/25 dark:hover:bg-amber-400/20',
        text: 'text-amber-900/90 dark:text-amber-200',
        border: 'shadow-amber-700/8'
    }
};

const getSessionColors = (sessionData: Session) => {
    if (sessionData.pendingRescheduleBy) {
        return STATUS_COLORS.reschedule_pending;
    }
    return STATUS_COLORS[sessionData.status] || STATUS_COLORS.scheduled;
};

export function MentorScheduleView() {
    const { session, mentorProfile, mentorAccess } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const scheduleAccess = getMentorFeatureDecision(
        mentorAccess,
        MENTOR_FEATURE_KEYS.scheduleManage
    );
    const canManageSchedule = Boolean(scheduleAccess?.allowed);

    const [currentWeek, setCurrentWeek] = useState(new Date());
    const [viewType, setViewType] = useState<ViewType>('week');
    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    // Dialog states
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
    const [showRespondDialog, setShowRespondDialog] = useState(false);
    const [respondAction, setRespondAction] = useState<'accept' | 'reject' | 'counter_propose' | 'cancel_session'>('accept');
    const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
    const [withdrawLoading, setWithdrawLoading] = useState(false);
    const [lobbySessionId, setLobbySessionId] = useState<string | null>(null);
    const bookingsQuery = useBookingsQuery(session?.user?.id, 'mentor', {
        enabled: canManageSchedule,
    });
    const withdrawRescheduleRequestMutation = useWithdrawRescheduleRequestMutation();
    const sessions = (bookingsQuery.data ?? []) as Session[];
    const loading = bookingsQuery.isLoading;

    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    // Handle URL params for auto-opening session
    useEffect(() => {
        const targetSession = findSessionFromDashboardParams(searchParams, sessions);

        if (targetSession) {
            setSelectedSession(targetSession);
            setDialogOpen(true);
        }
    }, [searchParams, sessions]);

    // Helpers
    const getSessionsForDate = (date: Date) => {
        return sessions
            .filter(session => isSameDay(new Date(session.scheduledAt), date))
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    };

    const navigateWeek = (direction: 'prev' | 'next' | 'today') => {
        if (direction === 'today') {
            setCurrentWeek(new Date());
        } else {
            setCurrentWeek(prev => direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1));
        }
    };

    const formatCurrency = (amount: number | undefined, currency: string = 'USD') => {
        if (!amount) return '';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    };

    const getTimeUntilSession = (scheduledAt: string | Date) => {
        const sessionTime = new Date(scheduledAt);
        const now = new Date();
        if (isPast(sessionTime) && !isToday(sessionTime)) return 'Passed';
        return formatDistanceToNow(sessionTime, { addSuffix: true });
    };

    // Withdraw logic (reused)
    const handleWithdrawReschedule = async () => {
        if (!selectedSession) return;
        setWithdrawLoading(true);
        try {
            await withdrawRescheduleRequestMutation.mutateAsync({
                bookingId: selectedSession.id,
            });
            toast.success('Reschedule withdrawn');
            void bookingsQuery.refetch();
            setDialogOpen(false);
        } catch (error) {
            toast.error('Failed to withdraw request');
        } finally {
            setWithdrawLoading(false);
        }
    };

    if (!session) return null;

    if (!canManageSchedule) {
        return (
            <MentorFeaturePageGate
                feature={MENTOR_FEATURE_KEYS.scheduleManage}
                access={scheduleAccess}
                mentorProfile={mentorProfile}
                routeBasePath='/dashboard'
                userName={session.user?.name}
            />
        );
    }

    const isReschedulePending = selectedSession?.pendingRescheduleBy === 'mentee';
    const isInitiator = selectedSession?.pendingRescheduleBy === 'mentor';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Schedule</h2>
                    <p className="text-gray-600 dark:text-gray-400">Manage your mentoring sessions</p>
                </div>
                <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Update Availability
                </Button>
            </div>

            {/* Stats Grid - Moved to Top */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                            <Calendar className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">This Week</p>
                            <p className="text-xl font-bold">{sessions.filter(s => {
                                const sDate = new Date(s.scheduledAt);
                                return sDate >= weekStart && sDate <= weekEnd;
                            }).length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
                            <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Completed</p>
                            <p className="text-xl font-bold">{sessions.filter(s => s.status === 'completed').length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Active Mentees</p>
                            <p className="text-xl font-bold">{new Set(sessions.map(s => s.menteeId)).size}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
                            <Clock className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Upcoming</p>
                            <p className="text-xl font-bold">{sessions.filter(s => s.status === 'scheduled' && new Date(s.scheduledAt) > new Date()).length}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* View Toggle & Navigation */}
            <div className="flex items-center justify-between bg-card p-2 rounded-lg border">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => navigateWeek('prev')}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="font-medium min-w-[140px] text-center">
                        {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => navigateWeek('next')}><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => navigateWeek('today')}>Today</Button>
                </div>
                <div className="flex bg-muted p-1 rounded-md">
                    <Button
                        variant={viewType === 'week' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setViewType('week')}
                    >
                        <CalendarDays className="h-3.5 w-3.5 mr-1" /> Week
                    </Button>
                    <Button
                        variant={viewType === 'list' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setViewType('list')}
                    >
                        <List className="h-3.5 w-3.5 mr-1" /> List
                    </Button>
                </div>
            </div>

            {/* Content Area */}
            {viewType === 'week' ? (
                <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                    {weekDays.map(day => {
                        const daySessions = getSessionsForDate(day);
                        return (
                            <div key={day.toISOString()} className={cn(
                                "border rounded-xl p-3 min-h-[200px] flex flex-col transition-colors",
                                isToday(day) ? "bg-primary/5 border-primary/20" : "bg-card hover:border-gray-300 dark:hover:border-gray-700"
                            )}>
                                <div className="text-sm font-medium mb-3 flex justify-between items-center">
                                    <span className="text-muted-foreground">{format(day, 'EEE')}</span>
                                    <span className={cn(
                                        "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                                        isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
                                    )}>{format(day, 'd')}</span>
                                </div>
                                <div className="space-y-2 flex-1">
                                    {daySessions.map(session => {
                                        const colors = getSessionColors(session);
                                        return (
                                            <button
                                                key={session.id}
                                                onClick={() => { setSelectedSession(session); setDialogOpen(true); }}
                                                className={cn(
                                                    "w-full text-left p-2 rounded-lg text-xs border transition-all hover:scale-[1.02] shadow-sm",
                                                    colors.bg, colors.text, colors.border
                                                )}
                                            >
                                                <div className="font-semibold truncate leading-tight mb-1">{session.title}</div>
                                                <div className="opacity-80 flex items-center justify-between text-[10px]">
                                                    <span>{format(new Date(session.scheduledAt), 'h:mm a')}</span>
                                                    {session.pendingRescheduleBy && <span className="" title="Reschedule Pending">⏳</span>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="bg-card rounded-xl border divide-y">
                    {sessions.length === 0 && <div className="p-8 text-center text-gray-500">No sessions found</div>}
                    {sessions.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                        .map(session => (
                            <div key={session.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-muted/50 cursor-pointer gap-4" onClick={() => { setSelectedSession(session); setDialogOpen(true); }}>
                                <div className="flex items-center gap-4">
                                    <div className="flex-shrink-0 w-16 text-center bg-muted/50 rounded-lg p-2 border">
                                        <div className="text-sm font-bold text-foreground">{format(new Date(session.scheduledAt), 'MMM d')}</div>
                                        <div className="text-xs text-muted-foreground uppercase">{format(new Date(session.scheduledAt), 'EEE')}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-lg text-foreground">{session.title}</div>
                                        <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                                            <span className="flex items-center"><Clock className="h-3 w-3 mr-1" /> {format(new Date(session.scheduledAt), 'h:mm a')}</span>
                                            <span>•</span>
                                            <span>{session.duration} min</span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                <span className="opacity-70">with</span>
                                                {session.menteeAvatar && <Avatar className="h-4 w-4"><AvatarImage src={session.menteeAvatar} /></Avatar>}
                                                <span className="font-medium text-foreground">{session.menteeName || 'Mentee'}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <Badge variant="outline" className={cn("self-start sm:self-center capitalize", getSessionColors(session).text, getSessionColors(session).bg)}>
                                    {session.pendingRescheduleBy ? 'Reschedule Pending' : session.status.replace('_', ' ')}
                                </Badge>
                            </div>
                        ))}
                </div>
            )}

            {/* Session Details Popup */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md p-0 overflow-hidden gap-0 border-0 shadow-xl">
                    <DialogTitle className="sr-only">
                        {selectedSession?.title ?? 'Session Details'}
                    </DialogTitle>
                    {selectedSession && (
                        <>
                            {/* Mentee Info Header */}
                            <div className="bg-muted/30 p-6 border-b">
                                <div className="flex items-start justify-between mb-5">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-14 w-14 border-2 border-background shadow-sm">
                                            <AvatarImage src={selectedSession.menteeAvatar} />
                                            <AvatarFallback>{selectedSession.menteeName?.[0] || '?'}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <h4 className="font-bold text-lg text-foreground">{selectedSession.menteeName || 'Unknown Mentee'}</h4>
                                            <p className="text-sm text-muted-foreground font-medium">Mentee</p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="uppercase text-[10px] tracking-wider font-semibold">
                                        {selectedSession.status.replace('_', ' ')}
                                    </Badge>
                                </div>

                                <h3 className="text-lg font-bold mb-1 leading-tight">{selectedSession.title}</h3>
                                <p className="text-sm text-muted-foreground line-clamp-2">{selectedSession.description}</p>
                            </div>

                            {/* Status Alert for Pending Reschedule */}
                            {selectedSession.pendingRescheduleBy === 'mentee' && (
                                <div className="px-6 py-4 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/50">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5" />
                                        <div className="flex-1">
                                            <h5 className="font-medium text-amber-900 dark:text-amber-200">Reschedule Requested</h5>
                                            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                                Mentee proposes: <strong className="font-semibold">{format(new Date(selectedSession.pendingRescheduleTime!), 'MMM d, h:mm a')}</strong>
                                            </p>
                                            <div className="flex gap-2 mt-3">
                                                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white h-8 border-none" onClick={() => { setRespondAction('accept'); setShowRespondDialog(true); }}>
                                                    Accept
                                                </Button>
                                                <Button size="sm" variant="outline" className="border-amber-200 hover:bg-amber-100 text-amber-700 h-8 bg-transparent" onClick={() => { setRespondAction('counter_propose'); setShowRespondDialog(true); }}>
                                                    Counter
                                                </Button>
                                                <Button size="sm" variant="ghost" className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 h-8" onClick={() => { setRespondAction('reject'); setShowRespondDialog(true); }}>
                                                    Decline
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Session Meta */}
                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                    <div className="flex items-center gap-2.5 text-sm">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">{format(new Date(selectedSession.scheduledAt), 'EEEE, MMM d')}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-sm">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">{format(new Date(selectedSession.scheduledAt), 'h:mm a')} ({selectedSession.duration}m)</span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-sm">
                                        <Video className="h-4 w-4 text-muted-foreground" />
                                        <span className="capitalize font-medium">{selectedSession.meetingType} Call</span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-sm">
                                        <div className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-secondary-foreground font-medium">
                                            {getTimeUntilSession(selectedSession.scheduledAt)}
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="pt-2 flex flex-col gap-3">
                                    {selectedSession.status === 'scheduled' && !selectedSession.pendingRescheduleBy && (
                                        <>
                                            {!isPast(new Date(selectedSession.scheduledAt)) && (
                                                <Button className="w-full font-semibold shadow-sm" size="lg" onClick={() => { setDialogOpen(false); setLobbySessionId(selectedSession.id); }}>
                                                    <Video className="h-4 w-4 mr-2" /> Join Session
                                                </Button>
                                            )}
                                            <div className="grid grid-cols-2 gap-3">
                                                <Button variant="outline" className="border-input hover:bg-accent" onClick={() => setShowRescheduleDialog(true)}>
                                                    <RefreshCw className="h-3.5 w-3.5 mr-2" /> Reschedule
                                                </Button>
                                                <Button variant="outline" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-100" onClick={() => setShowCancelDialog(true)}>
                                                    <XCircle className="h-3.5 w-3.5 mr-2" /> Cancel
                                                </Button>
                                            </div>
                                            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                                                <FileText className="h-3.5 w-3.5 mr-2" /> Add Session Notes
                                            </Button>
                                        </>
                                    )}

                                    {/* Pending Actions (Initiator) */}
                                    {selectedSession.pendingRescheduleBy === 'mentor' && (
                                        <div className="space-y-3">
                                            <div className="p-3 bg-muted/50 rounded-lg text-sm text-center text-muted-foreground">
                                                You requested a reschedule to <strong>{format(new Date(selectedSession.pendingRescheduleTime!), 'MMM d, h:mm a')}</strong>.
                                                <br />Waiting for mentee response.
                                            </div>
                                            <Button variant="outline" className="w-full" onClick={handleWithdrawReschedule} disabled={withdrawLoading}>
                                                <Undo2 className="h-4 w-4 mr-2" /> Withdraw Request
                                            </Button>
                                            <Button variant="ghost" size="sm" className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => setShowCancelDialog(true)}>
                                                Cancel Session
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Sub-Dialogs */}
            {selectedSession && (
                <>
                    <RescheduleResponseDialog
                        open={showRespondDialog}
                        onOpenChange={setShowRespondDialog}
                        requestId={selectedSession.pendingRescheduleRequestId!}
                        sessionId={selectedSession.id}
                        sessionTitle={selectedSession.title}
                        proposedTime={new Date(selectedSession.pendingRescheduleTime!)}
                        originalTime={new Date(selectedSession.scheduledAt)}
                        initiatedBy={selectedSession.pendingRescheduleBy!}
                        userRole="mentor"
                        mentorId={selectedSession.mentorId}
                        initialAction={respondAction}
                        onSuccess={() => { setShowRespondDialog(false); setDialogOpen(false); void bookingsQuery.refetch(); }}
                    />
                    <CancelDialog
                        open={showCancelDialog}
                        onOpenChange={setShowCancelDialog}
                        sessionId={selectedSession.id}
                        sessionTitle={selectedSession.title}
                        userRole="mentor"
                        sessionRate={selectedSession.rate}
                        scheduledAt={new Date(selectedSession.scheduledAt)}
                        onSuccess={() => { setShowCancelDialog(false); setDialogOpen(false); void bookingsQuery.refetch(); }}
                    />
                    <RescheduleDialog
                        open={showRescheduleDialog}
                        onOpenChange={setShowRescheduleDialog}
                        sessionId={selectedSession.id}
                        sessionTitle={selectedSession.title}
                        mentorId={selectedSession.mentorId}
                        currentDate={new Date(selectedSession.scheduledAt)}
                        currentDuration={selectedSession.duration}
                        userRole="mentor"
                        onSuccess={() => { setShowRescheduleDialog(false); setDialogOpen(false); void bookingsQuery.refetch(); }}
                    />
                </>
            )}

            <SessionLobbyModal
                sessionId={lobbySessionId}
                isOpen={!!lobbySessionId}
                viewerRole="mentor"
                onClose={() => setLobbySessionId(null)}
            />
        </div>
    );
}
