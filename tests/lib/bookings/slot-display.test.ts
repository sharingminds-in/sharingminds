import { describe, expect, it } from 'vitest';

import {
  clampSlotPage,
  filterSlotsByPeriod,
  getSlotPeriod,
  paginateSlots,
} from '@/lib/bookings/slot-display';

describe('slot display helpers', () => {
  const slots = [
    new Date(2026, 4, 21, 8, 0),
    new Date(2026, 4, 21, 11, 30),
    new Date(2026, 4, 21, 13, 0),
    new Date(2026, 4, 21, 16, 30),
    new Date(2026, 4, 21, 18, 0),
  ];

  it('groups slots into morning, afternoon, and evening bands', () => {
    expect(getSlotPeriod(slots[0])).toBe('morning');
    expect(getSlotPeriod(slots[2])).toBe('afternoon');
    expect(getSlotPeriod(slots[4])).toBe('evening');
  });

  it('filters a period without changing the original slot order', () => {
    expect(filterSlotsByPeriod(slots, 'afternoon')).toEqual([
      slots[2],
      slots[3],
    ]);
  });

  it('paginates visible slots into fixed-size batches', () => {
    expect(paginateSlots(slots, 1, 2)).toEqual([slots[2], slots[3]]);
  });

  it('clamps stale page indexes when the filtered result shrinks', () => {
    expect(clampSlotPage(3, 2, 2)).toBe(0);
    expect(clampSlotPage(2, 5, 2)).toBe(2);
  });
});
