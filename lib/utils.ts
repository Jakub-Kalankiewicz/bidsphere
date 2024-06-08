import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export const formatTimeRemaining = (endTime: Date) => {
  const timeDifference = new Date(endTime).getTime() - new Date().getTime();
  const minutes = Math.floor(timeDifference / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  } else {
    return `${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""}`;
  }
};