import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractBroadcastDateTime(filename: string): { date: string | null, time: string | null } {
  // Format 1: 02-RADIO-SALKANTAY-CUSCO_2026-01-30-0644
  // Matches _YYYY-MM-DD-HHMM
  const format1 = /_(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/;
  const match1 = filename.match(format1);
  if (match1) {
      return {
          date: `${match1[1]}-${match1[2]}-${match1[3]}`,
          time: `${match1[4]}:${match1[5]}`
      };
  }

  // Format 2: x_20260131064221304.aac
  // Matches _YYYYMMDDHHMM
  const format2 = /_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/;
  const match2 = filename.match(format2);
  if (match2) {
      return {
           date: `${match2[1]}-${match2[2]}-${match2[3]}`,
           time: `${match2[4]}:${match2[5]}`
      };
  }

  return { date: null, time: null };
}
