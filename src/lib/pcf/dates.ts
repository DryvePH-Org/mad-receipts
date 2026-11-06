import { formatInTimeZone } from "date-fns-tz";

const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "Asia/Manila";

export function formatDate(value: string) {
  return formatInTimeZone(new Date(value), APP_TIMEZONE, "MMM d, yyyy");
}

export function formatDateTime(value: string) {
  return formatInTimeZone(new Date(value), APP_TIMEZONE, "MMM d, yyyy h:mm a");
}

export function todayInAppTz() {
  return formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
}

export function monthStartInAppTz() {
  return formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-01");
}

export function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return formatInTimeZone(
    new Date(Date.UTC(year, month - 1, 1, 12)),
    APP_TIMEZONE,
    "MMMM yyyy",
  );
}
