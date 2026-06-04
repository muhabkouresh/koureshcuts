import {
  daysInMonth,
  firstWeekdayMondayFirst,
  weekdayOf,
  toDateStr,
} from "../src/lib/time";

const COLS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
// Real weekday (Mon-first index) of a date, via JS getUTCDay.
function realCol(ds: string): number {
  return (weekdayOf(ds) + 6) % 7;
}

for (const [y, m0] of [
  [2026, 6],
  [2026, 7],
  [2026, 0],
] as [number, number][]) {
  const lead = firstWeekdayMondayFirst(y, m0);
  console.log(`\n${y}-${String(m0 + 1).padStart(2, "0")}  lead=${lead}`);
  let mismatches = 0;
  for (let day = 1; day <= daysInMonth(y, m0); day++) {
    const ds = toDateStr(y, m0, day);
    const gridCol = (lead + day - 1) % 7; // column in the rendered grid
    const real = realCol(ds);
    if (gridCol !== real) {
      mismatches++;
      console.log(
        `  MISMATCH day ${day}: grid=${COLS[gridCol]} real=${COLS[real]}`,
      );
    }
  }
  console.log(mismatches === 0 ? "  alignment OK" : `  ${mismatches} mismatches`);
}
