import { formatPHP } from "@/lib/pcf/money";
import type { Role } from "@/lib/pcf/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

import { notify, recipientsByRole } from "./deliver";

export type DigestStats = {
  awaitingApproval: number;
  readyToRelease: number;
  pendingReviews: number;
  oldestReviewHours: number | null;
  flagged: number;
  drafts: number;
  submittedRequests: number;
  approvedRequests: number;
  lowFunds: { name: string; expectedCash: number }[];
};

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function age(hours: number) {
  return hours >= 48 ? `${Math.floor(hours / 24)} days` : `${Math.max(1, Math.floor(hours))}h`;
}

type Item = { text: string; path: string };

// What each role needs to be reminded about today. An empty list means that
// role gets no email.
export function digestItemsFor(role: Role, stats: DigestStats): Item[] {
  const items: Item[] = [];

  const approval = () =>
    stats.awaitingApproval > 0 &&
    items.push({
      text: `${plural(stats.awaitingApproval, "voucher")} waiting for your approval before cash is released`,
      path: "/pcf/approvals",
    });
  const ready = () =>
    stats.readyToRelease > 0 &&
    items.push({
      text: `${plural(stats.readyToRelease, "approved voucher")} ready for you to release the cash`,
      path: "/pcf/vouchers",
    });
  const review = () =>
    stats.pendingReviews > 0 &&
    items.push({
      text: `${plural(stats.pendingReviews, "voucher")} waiting for review${
        stats.oldestReviewHours !== null ? ` (oldest ${age(stats.oldestReviewHours)})` : ""
      }`,
      path: "/pcf/approvals",
    });
  const flagged = () =>
    stats.flagged > 0 &&
    items.push({
      text: `${plural(stats.flagged, "flagged voucher")} still unresolved`,
      path: "/pcf/vouchers?status=rejected",
    });
  const drafts = () =>
    stats.drafts > 0 &&
    items.push({
      text: `${plural(stats.drafts, "draft voucher")} not yet released`,
      path: "/pcf/vouchers?status=draft",
    });
  const requests = () => {
    if (stats.submittedRequests > 0) {
      items.push({
        text: `${plural(stats.submittedRequests, "replenishment request")} waiting for accounting review`,
        path: "/pcf/replenishments",
      });
    }
    if (stats.approvedRequests > 0) {
      items.push({
        text: `${plural(stats.approvedRequests, "approved replenishment")} waiting to be closed`,
        path: "/pcf/replenishments",
      });
    }
  };
  const low = () => {
    for (const fund of stats.lowFunds) {
      items.push({
        text: `${fund.name} is low: ${formatPHP(fund.expectedCash)} on hand`,
        path: "/pcf/replenishments",
      });
    }
  };

  switch (role) {
    case "approver":
      approval();
      review();
      break;
    case "custodian":
      ready();
      flagged();
      drafts();
      low();
      break;
    case "accounting":
      requests();
      flagged();
      low();
      break;
    case "admin":
      approval();
      review();
      flagged();
      drafts();
      requests();
      low();
      break;
  }

  return items;
}

async function loadStats(): Promise<DigestStats> {
  const admin = createAdminClient();
  const vouchersWith = async (status: "submitted" | "released" | "rejected" | "draft") => {
    const { count } = await admin
      .from("vouchers")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return count ?? 0;
  };
  const requestsWith = async (status: "submitted" | "approved") => {
    const { count } = await admin
      .from("replenishments")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return count ?? 0;
  };

  const [
    awaitingApproval,
    readyToRelease,
    pendingReviews,
    flagged,
    drafts,
    submittedRequests,
    approvedRequests,
  ] = await Promise.all([
      vouchersWith("submitted"),
      admin
        .from("vouchers")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .is("released_at", null)
        .then(({ count }) => count ?? 0),
      vouchersWith("released"),
      vouchersWith("rejected"),
      vouchersWith("draft"),
      requestsWith("submitted"),
      requestsWith("approved"),
    ]);

  const { data: oldest } = await admin
    .from("vouchers")
    .select("released_at")
    .eq("status", "released")
    .order("released_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: low } = await admin
    .from("fund_balance_v")
    .select("name, expected_cash")
    .eq("is_low", true);

  return {
    awaitingApproval,
    readyToRelease,
    pendingReviews,
    oldestReviewHours: oldest?.released_at
      ? (Date.now() - new Date(oldest.released_at).getTime()) / 3_600_000
      : null,
    flagged,
    drafts,
    submittedRequests,
    approvedRequests,
    lowFunds: (low ?? []).map((fund) => ({
      name: fund.name ?? "Fund",
      expectedCash: fund.expected_cash ?? 0,
    })),
  };
}

const ROLES: Role[] = ["approver", "custodian", "accounting", "admin"];

export async function sendDailyDigest() {
  const stats = await loadStats();
  let recipients = 0;

  for (const role of ROLES) {
    const items = digestItemsFor(role, stats);
    if (items.length === 0) continue;

    const people = await recipientsByRole([role]);
    recipients += people.length;
    await notify({
      event: "digest.daily",
      recipients: people,
      subject: `Daily summary: ${items.length === 1 ? items[0].text : `${items.length} things need attention`}`,
      content: () => ({
        tone: "action",
        heading: "What needs your attention today",
        paragraphs: items.map((item) => `• ${item.text}`),
        cta: { label: "Open the app", path: items[0].path },
      }),
    });
  }

  return { recipients, stats };
}
