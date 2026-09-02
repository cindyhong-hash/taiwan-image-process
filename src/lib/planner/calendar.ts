export type SchedulableItem = {
  id: string;
  scheduledDate: string | null;
};

const isoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function assignInitialSchedule<T extends SchedulableItem>(items: T[], year: number, month: number): T[] {
  const unscheduledCount = items.filter((item) => !item.scheduledDate).length;
  if (unscheduledCount === 0) return items;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let index = 0;

  return items.map((item) => {
    if (item.scheduledDate) return item;
    const day = unscheduledCount === 1
      ? Math.ceil(daysInMonth / 2)
      : Math.floor(1 + index * (daysInMonth - 1) / (unscheduledCount - 1));
    index += 1;
    return { ...item, scheduledDate: isoDate(year, month, day) };
  });
}

export function calendarDays(year: number, month: number): Array<number | null> {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array<number | null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
}

export function dateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
