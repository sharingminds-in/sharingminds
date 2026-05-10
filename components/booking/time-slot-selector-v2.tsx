"use client"

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { 
  format, 
  addMonths,
  subMonths,
  startOfMonth, 
  endOfMonth, 
  startOfWeek,
  endOfWeek,
  eachDayOfInterval, 
  isSameDay, 
  isToday,
  isPast,
  isSameMonth,
  parseISO,
  endOfDay
} from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTRPCClient } from '@/lib/trpc/react';
import {
  clampSlotPage,
  getSlotPeriod,
  paginateSlots,
  type SlotPeriod,
} from '@/lib/bookings/slot-display';

interface TimeSlotSelectorProps {
  mentorId: string;
  onTimeSelected: (selectedTime: Date) => void;
  initialSelectedTime?: Date;
}

interface AvailableSlot {
  startTime: string;
  endTime: string;
}

interface MonthAvailability {
  [day: string]: boolean; // format: "yyyy-MM-dd"
}

const SLOT_PAGE_SIZE = 9;
const SLOT_PERIODS: Array<{ id: SlotPeriod; label: string }> = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

export function TimeSlotSelectorV2({ mentorId, onTimeSelected, initialSelectedTime }: TimeSlotSelectorProps) {
  const trpcClient = useTRPCClient();
  const [currentMonth, setCurrentMonth] = useState(initialSelectedTime || new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialSelectedTime);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<Date | undefined>(initialSelectedTime);
  
  const [dailySlots, setDailySlots] = useState<AvailableSlot[]>([]);
  const [monthAvailability, setMonthAvailability] = useState<MonthAvailability>({});
  
  const [dailyLoading, setDailyLoading] = useState(false);
  const [monthLoading, setMonthLoading] = useState(true);

  const [mentorTimezone, setMentorTimezone] = useState<string>('UTC');
  const [slotPeriod, setSlotPeriod] = useState<SlotPeriod>('morning');
  const [slotPage, setSlotPage] = useState(0);
  const userTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const firstDayOfMonth = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const lastDayOfMonth = useMemo(() => endOfMonth(currentMonth), [currentMonth]);

  const calendarDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(firstDayOfMonth, { weekStartsOn: 1 }),
      end: endOfWeek(lastDayOfMonth, { weekStartsOn: 1 }),
    });
  }, [firstDayOfMonth, lastDayOfMonth]);

  const decoratedDailySlots = useMemo(
    () =>
      dailySlots.map((slot) => ({
        slot,
        startDate: parseISO(slot.startTime),
      })),
    [dailySlots]
  );

  const periodCounts = useMemo(
    () =>
      SLOT_PERIODS.reduce(
        (counts, period) => ({
          ...counts,
          [period.id]: decoratedDailySlots.filter(
            ({ startDate }) => getSlotPeriod(startDate) === period.id
          ).length,
        }),
        { morning: 0, afternoon: 0, evening: 0 } as Record<SlotPeriod, number>
      ),
    [decoratedDailySlots]
  );

  const periodSlots = useMemo(
    () =>
      decoratedDailySlots.filter(
        ({ startDate }) => getSlotPeriod(startDate) === slotPeriod
      ),
    [decoratedDailySlots, slotPeriod]
  );

  const normalizedSlotPage = clampSlotPage(
    slotPage,
    periodSlots.length,
    SLOT_PAGE_SIZE
  );
  const visibleSlots = paginateSlots(
    periodSlots,
    normalizedSlotPage,
    SLOT_PAGE_SIZE
  );
  const totalSlotPages = Math.max(
    1,
    Math.ceil(periodSlots.length / SLOT_PAGE_SIZE)
  );

  const fetchMonthAvailability = useCallback(async (month: Date) => {
    setMonthLoading(true);
    try {
      const data = await trpcClient.mentor.availableSlots.query({
        mentorUserId: mentorId,
        startDate: startOfMonth(month).toISOString(),
        endDate: endOfMonth(month).toISOString(),
        timezone: userTimezone,
      });

      const availability: MonthAvailability = {};
      (data.slots || []).forEach((slot: AvailableSlot) => {
        const day = format(parseISO(slot.startTime), 'yyyy-MM-dd');
        availability[day] = true;
      });
      setMonthAvailability(availability);
      setMentorTimezone(data.mentorTimezone || 'UTC');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'An error occurred while fetching availability.'
      );
    } finally {
      setMonthLoading(false);
    }
  }, [mentorId, trpcClient, userTimezone]);

  const fetchDailySlots = useCallback(async (date: Date) => {
    setDailyLoading(true);
    setDailySlots([]);
    try {
      const data = await trpcClient.mentor.availableSlots.query({
        mentorUserId: mentorId,
        startDate: date.toISOString(),
        endDate: endOfDay(date).toISOString(),
        timezone: userTimezone,
      });
      setDailySlots(data.slots || []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'An error occurred while fetching time slots.'
      );
    } finally {
      setDailyLoading(false);
    }
  }, [mentorId, trpcClient, userTimezone]);

  useEffect(() => {
    fetchMonthAvailability(currentMonth);
  }, [currentMonth, fetchMonthAvailability]);

  useEffect(() => {
    if (selectedDate) {
      fetchDailySlots(selectedDate);
    }
  }, [selectedDate, fetchDailySlots]);

  useEffect(() => {
    const firstAvailablePeriod = SLOT_PERIODS.find(
      (period) => periodCounts[period.id] > 0
    )?.id;

    if (firstAvailablePeriod && periodCounts[slotPeriod] === 0) {
      setSlotPeriod(firstAvailablePeriod);
    }

    setSlotPage(0);
  }, [dailySlots, periodCounts, slotPeriod]);

  // Auto-select today if it has availability and no initial time is set
  useEffect(() => {
    if (!initialSelectedTime && !monthLoading) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      if (monthAvailability[todayStr]) {
        setSelectedDate(new Date());
      }
    }
  }, [initialSelectedTime, monthLoading, monthAvailability]);

  const handleDateClick = (day: Date) => {
    if (isPast(day) && !isToday(day)) return;
    setSelectedDate(day);
    setSelectedTimeSlot(undefined);
    setSlotPage(0);
  };

  const handleTimeSlotSelection = (slot: AvailableSlot) => {
    const slotTime = parseISO(slot.startTime);
    setSelectedTimeSlot(slotTime);
  };

  const handleConfirm = () => {
    if (selectedTimeSlot) {
      onTimeSelected(selectedTimeSlot);
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = direction === 'prev' ? subMonths(currentMonth, 1) : addMonths(currentMonth, 1);
    setCurrentMonth(newMonth);
    setSelectedDate(undefined);
    setSelectedTimeSlot(undefined);
    setDailySlots([]);
    setSlotPage(0);
  };

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(300px,0.95fr)_minmax(340px,1.05fr)]">
      <Card className="h-full border-border/80">
        <CardContent className="flex h-full flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <Button aria-label="Previous month" variant="ghost" size="icon" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h3 className="text-base font-semibold">
              {format(currentMonth, 'MMMM yyyy')}
            </h3>
            <Button aria-label="Next month" variant="ghost" size="icon" onClick={() => navigateMonth('next')}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          {monthLoading ? (
            <Skeleton className="h-full min-h-[280px] w-full" />
          ) : (
            <div className="grid flex-1 grid-cols-7 gap-1 text-center">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="pb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {day}
                </div>
              ))}
              {calendarDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const isDayInPast = isPast(day) && !isToday(day);
                const isDayInCurrentMonth = isSameMonth(day, currentMonth);
                const hasAvailability = monthAvailability[dayStr];
                const isSelectable = !isDayInPast && hasAvailability;

                return (
                  <div key={day.toString()} className="flex items-center justify-center">
                    <Button
                      variant={selectedDate && isSameDay(day, selectedDate) ? 'default' : 'ghost'}
                      className={cn(
                        "h-9 w-9 rounded-full p-0 text-sm font-semibold",
                        !isDayInCurrentMonth && "text-gray-300 dark:text-gray-600",
                        isToday(day) && !isSameDay(day, selectedDate) && "bg-blue-100/60 dark:bg-blue-900/30",
                        selectedDate && isSameDay(day, selectedDate) && "bg-blue-600 text-white hover:bg-blue-700",
                        !isSelectable && "cursor-not-allowed text-gray-400 opacity-50 line-through dark:text-gray-500",
                        isSelectable && !isSameDay(day, selectedDate) && "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      )}
                      onClick={() => isSelectable && handleDateClick(day)}
                      disabled={!isSelectable}
                    >
                      {format(day, 'd')}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-full border-border/80">
        <CardContent className="flex h-full min-h-0 flex-col p-4">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Available times
            </p>
            <h4 className="mt-1 text-lg font-semibold">
              {selectedDate
                ? format(selectedDate, 'EEEE, MMMM d')
                : 'Choose an available date'}
            </h4>
            {mentorTimezone !== userTimezone && (
              <div className="mt-1 flex items-center text-xs text-muted-foreground">
                <Globe className="mr-1.5 h-3 w-3" />
                Times shown in {userTimezone}
              </div>
            )}
          </div>

          {!selectedDate ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed text-center text-muted-foreground">
              <Calendar className="mb-3 h-8 w-8" />
              <p className="text-sm font-medium">Pick a date to see times</p>
              <p className="mt-1 text-xs">Only dates with availability are selectable.</p>
            </div>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {SLOT_PERIODS.map((period) => (
                  <Button
                    key={period.id}
                    type="button"
                    size="sm"
                    variant={slotPeriod === period.id ? 'default' : 'outline'}
                    onClick={() => {
                      setSlotPeriod(period.id);
                      setSlotPage(0);
                    }}
                    disabled={periodCounts[period.id] === 0}
                    className="justify-between"
                  >
                    <span>{period.label}</span>
                    <span className="text-[10px] opacity-70">
                      {periodCounts[period.id]}
                    </span>
                  </Button>
                ))}
              </div>

              <div className="flex-1 rounded-xl border p-3">
                {dailyLoading ? (
                  <div className="grid h-full grid-cols-3 gap-2">
                    {[...Array(SLOT_PAGE_SIZE)].map((_, index) => (
                      <Skeleton key={index} className="h-10 w-full" />
                    ))}
                  </div>
                ) : dailySlots.length > 0 && periodSlots.length > 0 ? (
                  <div className="grid h-full auto-rows-fr grid-cols-3 gap-2">
                    {visibleSlots.map(({ slot, startDate }) => {
                      const isSelected =
                        selectedTimeSlot &&
                        selectedTimeSlot.getTime() === startDate.getTime();

                      return (
                        <Button
                          key={slot.startTime}
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() => handleTimeSlotSelection(slot)}
                          className={cn(
                            "h-10",
                            isSelected && "bg-blue-600 hover:bg-blue-700"
                          )}
                        >
                          {format(startDate, 'h:mm a')}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
                    <Clock className="mb-2 h-8 w-8" />
                    <p className="text-sm font-medium">No slots in this period</p>
                    <p className="text-xs">Try another time of day.</p>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSlotPage((current) =>
                        clampSlotPage(
                          current - 1,
                          periodSlots.length,
                          SLOT_PAGE_SIZE
                        )
                      )
                    }
                    disabled={normalizedSlotPage === 0 || periodSlots.length === 0}
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {normalizedSlotPage + 1} / {totalSlotPages}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSlotPage((current) =>
                        clampSlotPage(
                          current + 1,
                          periodSlots.length,
                          SLOT_PAGE_SIZE
                        )
                      )
                    }
                    disabled={normalizedSlotPage >= totalSlotPages - 1}
                  >
                    Next
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  {selectedTimeSlot && (
                    <span className="hidden text-xs font-medium text-blue-700 dark:text-blue-300 sm:inline">
                      {format(selectedTimeSlot, 'h:mm a')} selected
                    </span>
                  )}
                  <Button onClick={handleConfirm} disabled={!selectedTimeSlot}>
                    Continue
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
