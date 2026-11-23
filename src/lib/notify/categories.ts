import type { Role } from "@/lib/roles";

/**
 * Every kind of personal Telegram message. `roles` who may get it, `urgent` messages ignore quiet hours,
 * `when` is only text for the settings page (the schedule itself lives in schedule.ts and the places that send).
 */
export interface NotifyCategory { id: string; label: string; detail: string; when: string; roles: readonly Role[]; urgent?: boolean }

export const NOTIFY_CATEGORIES: readonly NotifyCategory[] = [
  // Sales
  { id: "money_digest", label: "My deals: due, overdue, loan waiting", detail: "Deals due in 7 days, due today or late, loans waiting too long, collateral dates. Only your own deals.", when: "every morning at 8:00", roles: ["sales"] },
  { id: "sold_papers_missing", label: "Sold papers still missing on my deal", detail: "The signed AR, the buyer's ID or the deed is not in the car's folder.", when: "every 3 days, from 2 days after the AR is saved", roles: ["sales"] },
  { id: "deal_settled", label: "My deal is settled or the loan was released", detail: "", when: "right away", roles: ["sales"] },
  // Whoever decides on repairs
  { id: "repair_waiting", label: "A repair report is waiting for my approval", detail: "The car, the problems and who reported them.", when: "right away", roles: ["super_admin", "admin", "sales"] },
  // Buying
  { id: "sold_papers_added", label: "Sales added sold papers on a car", detail: "", when: "right away", roles: ["buying"] },
  { id: "scan_result", label: "A scan finished with warnings, or failed", detail: "One message per car.", when: "right away", roles: ["buying"] },
  { id: "ready_to_sold", label: "A car's documents are complete: move it to Sold", detail: "", when: "right away", roles: ["buying"] },
  { id: "handoff_reminder", label: "Papers still with the receiver", detail: "The cars handed off and not yet back, with the days out.", when: "every 3 days", roles: ["buying"] },
  { id: "review_digest", label: "Data check has open items", detail: "Same plate twice, statuses that differ, rows to check.", when: "every morning at 9:00, when there are open items", roles: ["buying"] },
  { id: "or_renewal", label: "A car's OR is due or late", detail: "Cars whose OR expires within 30 days or has expired. Sold cars are left out.", when: "every morning at 9:00, on 30, 14, 7 and 0 days before the expiry and then every 7 days while it is late", roles: ["buying"] },
  { id: "car_added", label: "Someone else added a new car", detail: "", when: "right away", roles: ["buying"] },
  // Admins
  { id: "system_alert", label: "Something is broken", detail: "The scanner is stuck, a Drive upload failed, sync jobs keep failing, or the daily backup is missing.", when: "right away, at most once an hour per problem", roles: ["super_admin"], urgent: true },
  { id: "void_cancel", label: "A receipt was voided, a deal cancelled or deleted", detail: "And who did it.", when: "right away", roles: ["super_admin", "admin"] },
  { id: "user_change", label: "A user was added or changed role", detail: "", when: "right away", roles: ["super_admin"] },
  { id: "weekly_summary", label: "Weekly summary", detail: "Receipts, overdue deals and documents stuck.", when: "Mondays at 8:00", roles: ["super_admin", "admin"] },
];

export const categoryById = (id: string): NotifyCategory | undefined => NOTIFY_CATEGORIES.find((c) => c.id === id);
export const categoriesForRole = (role: Role): NotifyCategory[] => NOTIFY_CATEGORIES.filter((c) => c.roles.includes(role));
