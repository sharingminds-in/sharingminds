export type SlotPeriod = 'morning' | 'afternoon' | 'evening';

export function getSlotPeriod(slotTime: Date): SlotPeriod {
  const hour = slotTime.getHours();

  if (hour < 12) {
    return 'morning';
  }

  if (hour < 17) {
    return 'afternoon';
  }

  return 'evening';
}

export function filterSlotsByPeriod<T extends Date>(
  slots: T[],
  period: SlotPeriod
) {
  return slots.filter((slot) => getSlotPeriod(slot) === period);
}

export function paginateSlots<T>(slots: T[], page: number, pageSize: number) {
  const start = page * pageSize;
  return slots.slice(start, start + pageSize);
}

export function clampSlotPage(page: number, totalItems: number, pageSize: number) {
  const lastPage = Math.max(0, Math.ceil(totalItems / pageSize) - 1);
  return Math.min(Math.max(page, 0), lastPage);
}
