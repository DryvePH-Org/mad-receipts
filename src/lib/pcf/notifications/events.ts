import { formatPHP } from "@/lib/pcf/money";
import { ROLE_LABELS, type Role } from "@/lib/pcf/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  notify,
  recipientById,
  recipientsByRole,
  type Recipient,
} from "./deliver";

type Row = { label: string; value: string };

async function nameOf(userId: string | null | undefined) {
  if (!userId) return "Someone";
  const { data } = await createAdminClient()
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? "Someone";
}

async function loadVoucher(id: string) {
  const admin = createAdminClient();
  const { data: voucher, error } = await admin
    .from("vouchers")
    .select(
      "id, pcv_number, payee, particulars, amount, receipt_path, no_receipt_reason, reject_reason, void_reason, prepared_by, fund_id, category_id",
    )
    .eq("id", id)
    .single();
  if (error) throw error;

  const [{ data: categories }, { data: fund }, { data: items }] = await Promise.all([
    admin.from("categories").select("id, name"),
    admin.from("funds").select("name").eq("id", voucher.fund_id).maybeSingle(),
    admin
      .from("voucher_items")
      .select("particulars, amount, category_id")
      .eq("voucher_id", id)
      .order("position", { ascending: true }),
  ]);
  const categoryName = (categoryId: string) =>
    categories?.find((category) => category.id === categoryId)?.name ?? "—";
  const lines = items ?? [];
  const multiple = lines.length > 1;
  const distinctCategories = new Set(lines.map((line) => line.category_id));

  const rows: Row[] = [
    { label: "Voucher", value: voucher.pcv_number },
    { label: "Payee", value: voucher.payee },
    { label: "Amount", value: formatPHP(voucher.amount) },
    {
      label: "Category",
      value:
        multiple && distinctCategories.size > 1
          ? "Multiple categories"
          : categoryName(voucher.category_id),
    },
    { label: "Fund", value: fund?.name ?? "—" },
    ...(multiple
      ? lines.map((line, index) => ({
          label: `Line ${index + 1}`,
          value: `${line.particulars} — ${formatPHP(line.amount)}${
            distinctCategories.size > 1 ? ` (${categoryName(line.category_id)})` : ""
          }`,
        }))
      : [{ label: "Particulars", value: voucher.particulars }]),
    {
      label: "Receipt",
      value: voucher.receipt_path
        ? "Attached"
        : `None — ${voucher.no_receipt_reason ?? "no reason given"}`,
    },
  ];

  return { voucher, rows };
}

async function loadReplenishment(id: string) {
  const admin = createAdminClient();
  const { data: request, error } = await admin
    .from("replenishments")
    .select("id, request_no, total, requested_by, review_note, fund_id")
    .eq("id", id)
    .single();
  if (error) throw error;

  const [{ data: fund }, { count }] = await Promise.all([
    admin.from("funds").select("name").eq("id", request.fund_id).maybeSingle(),
    admin
      .from("vouchers")
      .select("id", { count: "exact", head: true })
      .eq("replenishment_id", id),
  ]);

  const rows: Row[] = [
    { label: "Request", value: request.request_no },
    { label: "Fund", value: fund?.name ?? "—" },
    { label: "Vouchers", value: String(count ?? 0) },
    { label: "Total", value: formatPHP(request.total) },
  ];

  return { request, rows };
}

const exclude = (...ids: (string | null | undefined)[]) =>
  ids.filter((id): id is string => Boolean(id));

// ----------------------------------------------------------------- vouchers

export async function notifyVoucherSubmitted(voucherId: string, actorId: string) {
  const { voucher, rows } = await loadVoucher(voucherId);
  const actor = await nameOf(actorId);
  await notify({
    event: "voucher.submitted",
    entityType: "vouchers",
    entityId: voucherId,
    // Admins can approve too, which matters when the only approver is the preparer.
    recipients: await recipientsByRole(["approver", "admin"], {
      exclude: exclude(actorId, voucher.prepared_by),
    }),
    subject: `Approval needed before release: ${voucher.pcv_number} · ${formatPHP(voucher.amount)} to ${voucher.payee}`,
    content: () => ({
      tone: "action",
      heading: `${voucher.pcv_number} needs your approval before cash is released`,
      paragraphs: [
        `${actor} submitted a ${formatPHP(voucher.amount)} voucher. It is at or above the fund's approval amount, so no cash goes out until you approve it. You can also return it with a reason.`,
      ],
      rows,
      cta: { label: "Review vouchers", path: "/pcf/approvals" },
    }),
  });
}

export async function notifyVoucherPreApproved(voucherId: string, actorId: string) {
  const { voucher, rows } = await loadVoucher(voucherId);
  const actor = await nameOf(actorId);
  await notify({
    event: "voucher.pre_approved",
    entityType: "vouchers",
    entityId: voucherId,
    recipients: await recipientsByRole([], {
      include: [voucher.prepared_by],
      exclude: exclude(actorId),
    }),
    subject: `Approved — release the cash: ${voucher.pcv_number}`,
    content: () => ({
      tone: "action",
      heading: `${voucher.pcv_number} is approved`,
      paragraphs: [
        `${actor} approved this voucher. You can now release ${formatPHP(voucher.amount)} to ${voucher.payee}.`,
      ],
      rows,
      cta: { label: "Release the cash", path: `/pcf/vouchers/${voucherId}` },
    }),
  });
}

export async function notifyVoucherReturned(voucherId: string, actorId: string) {
  const { voucher, rows } = await loadVoucher(voucherId);
  const actor = await nameOf(actorId);
  await notify({
    event: "voucher.returned",
    entityType: "vouchers",
    entityId: voucherId,
    recipients: await recipientsByRole([], {
      include: [voucher.prepared_by],
      exclude: exclude(actorId),
    }),
    subject: `Returned: ${voucher.pcv_number} needs changes`,
    content: () => ({
      tone: "alert",
      heading: `${voucher.pcv_number} was returned`,
      paragraphs: [
        `${actor} returned this voucher before any cash was released. It is back in your drafts; fix it and submit it again, or void it.`,
      ],
      rows: [{ label: "Reason", value: voucher.reject_reason ?? "—" }, ...rows],
      cta: { label: "Open voucher", path: `/pcf/vouchers/${voucherId}` },
    }),
  });
}

export async function notifyVoucherReleased(voucherId: string, actorId: string) {
  const { voucher, rows } = await loadVoucher(voucherId);
  const actor = await nameOf(actorId);
  await notify({
    event: "voucher.released",
    entityType: "vouchers",
    entityId: voucherId,
    recipients: await recipientsByRole(["approver"], {
      exclude: exclude(actorId, voucher.prepared_by),
    }),
    subject: `Review needed: ${voucher.pcv_number} · ${formatPHP(voucher.amount)} to ${voucher.payee}`,
    content: () => ({
      tone: "action",
      heading: `${voucher.pcv_number} is waiting for review`,
      paragraphs: [
        `${actor} released ${formatPHP(voucher.amount)} in cash for this voucher. The cash is already out of the fund, so please check the receipt and details, then approve it or flag a problem.`,
      ],
      rows,
      cta: { label: "Review vouchers", path: "/pcf/approvals" },
    }),
  });
}

export async function notifyVoucherApproved(voucherId: string, actorId: string) {
  const { voucher, rows } = await loadVoucher(voucherId);
  const actor = await nameOf(actorId);
  await notify({
    event: "voucher.approved",
    entityType: "vouchers",
    entityId: voucherId,
    recipients: await recipientsByRole([], {
      include: [voucher.prepared_by],
      exclude: exclude(actorId),
    }),
    subject: `Approved: ${voucher.pcv_number}`,
    content: () => ({
      tone: "info",
      heading: `${voucher.pcv_number} was approved`,
      paragraphs: [`${actor} reviewed and approved this voucher. No action is needed.`],
      rows,
      cta: { label: "Open voucher", path: `/pcf/vouchers/${voucherId}` },
    }),
  });
}

export async function notifyVoucherFlagged(voucherId: string, actorId: string) {
  const { voucher, rows } = await loadVoucher(voucherId);
  const actor = await nameOf(actorId);
  await notify({
    event: "voucher.flagged",
    entityType: "vouchers",
    entityId: voucherId,
    recipients: await recipientsByRole(["admin"], {
      include: [voucher.prepared_by],
      exclude: exclude(actorId),
    }),
    subject: `Flagged: ${voucher.pcv_number} needs attention`,
    content: () => ({
      tone: "alert",
      heading: `${voucher.pcv_number} was flagged`,
      paragraphs: [
        `${actor} flagged this voucher. The cash stays counted against the fund until an admin voids it or the approver approves it once the issue is resolved.`,
      ],
      rows: [{ label: "Reason", value: voucher.reject_reason ?? "—" }, ...rows],
      cta: { label: "Open voucher", path: `/pcf/vouchers/${voucherId}` },
    }),
  });
}

export async function notifyVoucherVoided(voucherId: string, actorId: string) {
  const { voucher, rows } = await loadVoucher(voucherId);
  const actor = await nameOf(actorId);
  await notify({
    event: "voucher.voided",
    entityType: "vouchers",
    entityId: voucherId,
    recipients: await recipientsByRole(["admin"], {
      include: [voucher.prepared_by],
      exclude: exclude(actorId),
    }),
    subject: `Voided: ${voucher.pcv_number}`,
    content: () => ({
      tone: "alert",
      heading: `${voucher.pcv_number} was voided`,
      paragraphs: [
        `${actor} voided this voucher. The record is kept for the audit trail.`,
      ],
      rows: [{ label: "Reason", value: voucher.void_reason ?? "—" }, ...rows],
      cta: { label: "Open voucher", path: `/pcf/vouchers/${voucherId}` },
    }),
  });
}

// ------------------------------------------------------------ replenishments

export async function notifyReplenishmentSubmitted(id: string, actorId: string) {
  const { request, rows } = await loadReplenishment(id);
  const actor = await nameOf(actorId);
  await notify({
    event: "replenishment.submitted",
    entityType: "replenishments",
    entityId: id,
    recipients: await recipientsByRole(["accounting"], { exclude: exclude(actorId) }),
    subject: `Replenishment ${request.request_no} is waiting for review (${formatPHP(request.total)})`,
    content: () => ({
      tone: "action",
      heading: `${request.request_no} is waiting for your review`,
      paragraphs: [
        `${actor} submitted a replenishment request. Please check the vouchers and totals, then approve or reject it.`,
      ],
      rows,
      cta: { label: "Review request", path: `/pcf/replenishments/${id}` },
    }),
  });
}

export async function notifyReplenishmentApproved(id: string, actorId: string) {
  const { request, rows } = await loadReplenishment(id);
  const actor = await nameOf(actorId);
  await notify({
    event: "replenishment.approved",
    entityType: "replenishments",
    entityId: id,
    recipients: await recipientsByRole([], {
      include: [request.requested_by],
      exclude: exclude(actorId),
    }),
    subject: `Approved: ${request.request_no}`,
    content: () => ({
      tone: "info",
      heading: `${request.request_no} was approved`,
      paragraphs: [
        `${actor} approved this replenishment request. It will be closed once the cash has been handed back to the fund.`,
      ],
      rows,
      cta: { label: "Open request", path: `/pcf/replenishments/${id}` },
    }),
  });
}

export async function notifyReplenishmentRejected(id: string, actorId: string) {
  const { request, rows } = await loadReplenishment(id);
  const actor = await nameOf(actorId);
  await notify({
    event: "replenishment.rejected",
    entityType: "replenishments",
    entityId: id,
    recipients: await recipientsByRole(["admin"], {
      include: [request.requested_by],
      exclude: exclude(actorId),
    }),
    subject: `Rejected: ${request.request_no} — vouchers returned`,
    content: () => ({
      tone: "alert",
      heading: `${request.request_no} was rejected`,
      paragraphs: [
        `${actor} rejected this request. Its vouchers are back in the pool, so they can be bundled into a new request once the issue is fixed.`,
      ],
      rows: [{ label: "Note", value: request.review_note ?? "—" }, ...rows],
      cta: { label: "Open request", path: `/pcf/replenishments/${id}` },
    }),
  });
}

export async function notifyReplenishmentClosed(id: string, actorId: string) {
  const { request, rows } = await loadReplenishment(id);
  const actor = await nameOf(actorId);
  await notify({
    event: "replenishment.closed",
    entityType: "replenishments",
    entityId: id,
    recipients: await recipientsByRole(["admin"], {
      include: [request.requested_by],
      exclude: exclude(actorId),
    }),
    subject: `Fund restored: ${request.request_no} is closed`,
    content: () => ({
      tone: "info",
      heading: `${request.request_no} is closed and the fund is restored`,
      paragraphs: [
        `${actor} closed this replenishment. Its vouchers are closed and the expected cash is back to the full fund amount.`,
      ],
      rows,
      cta: { label: "Open request", path: `/pcf/replenishments/${id}` },
    }),
  });
}

// ------------------------------------------------------------ fund and cash

export async function notifyLowBalance(fundId: string) {
  const admin = createAdminClient();
  const [{ data: fund }, { data: balance }] = await Promise.all([
    admin
      .from("funds")
      .select("name, amount, low_balance_pct")
      .eq("id", fundId)
      .single(),
    admin
      .from("fund_balance_v")
      .select("expected_cash, released_vouchers_total")
      .eq("fund_id", fundId)
      .single(),
  ]);
  if (!fund || !balance) return;

  const { data: custodians } = await admin
    .from("fund_custodians")
    .select("custodian_id")
    .eq("fund_id", fundId);

  const threshold = (fund.amount * fund.low_balance_pct) / 100;
  await notify({
    event: "fund.low_balance",
    entityType: "funds",
    entityId: fundId,
    recipients: await recipientsByRole(["admin", "accounting"], {
      include: (custodians ?? []).map((row) => row.custodian_id),
    }),
    subject: `Low balance: ${fund.name} has ${formatPHP(balance.expected_cash ?? 0)} left`,
    content: () => ({
      tone: "alert",
      heading: `${fund.name} is running low`,
      paragraphs: [
        "Cash on hand has dropped below the warning level. Bundle the released vouchers into a replenishment request so the fund can be restored.",
      ],
      rows: [
        { label: "Cash on hand", value: formatPHP(balance.expected_cash ?? 0) },
        { label: "Released vouchers", value: formatPHP(balance.released_vouchers_total ?? 0) },
        { label: "Fund amount", value: formatPHP(fund.amount) },
        {
          label: "Warning level",
          value: `${fund.low_balance_pct}% of the fund (${formatPHP(threshold)})`,
        },
      ],
      cta: { label: "Create a replenishment", path: "/pcf/replenishments" },
    }),
  });
}

export async function notifyCashCountVariance(input: {
  fundId: string;
  countedCentavos: number;
  expectedCentavos: number;
  note: string | null;
  actorId: string;
}) {
  const variance = (input.countedCentavos - input.expectedCentavos) / 100;
  if (variance === 0) return;

  const { data: fund } = await createAdminClient()
    .from("funds")
    .select("name")
    .eq("id", input.fundId)
    .maybeSingle();
  const actor = await nameOf(input.actorId);
  const signed = `${variance > 0 ? "+" : "-"}${formatPHP(Math.abs(variance))}`;

  await notify({
    event: "cash_count.variance",
    entityType: "funds",
    entityId: input.fundId,
    recipients: await recipientsByRole(["admin", "accounting"], {
      exclude: exclude(input.actorId),
    }),
    subject: `Cash count variance: ${fund?.name ?? "fund"} ${signed}`,
    content: () => ({
      tone: "alert",
      heading: `Cash count is ${variance > 0 ? "over" : "short"} by ${formatPHP(Math.abs(variance))}`,
      paragraphs: [
        `${actor} counted the cash and it does not match what the system expects.`,
      ],
      rows: [
        { label: "Fund", value: fund?.name ?? "—" },
        { label: "Counted", value: formatPHP(input.countedCentavos / 100) },
        { label: "Expected", value: formatPHP(input.expectedCentavos / 100) },
        { label: "Variance", value: signed },
        { label: "Note", value: input.note || "—" },
      ],
      cta: { label: "Open cash counts", path: "/pcf/cash-count" },
    }),
  });
}

export async function notifyFundAssignment(input: {
  userId: string;
  added: string[];
  removed: string[];
  actorId: string;
}) {
  if (input.added.length === 0 && input.removed.length === 0) return;
  const [recipient, actor] = await Promise.all([
    recipientById(input.userId),
    nameOf(input.actorId),
  ]);
  if (!recipient) return;

  const paragraphs: string[] = [];
  if (input.added.length > 0) {
    paragraphs.push(
      `${actor} made you the custodian of: ${input.added.join(", ")}. You can now record vouchers, count cash, and request replenishments for ${input.added.length === 1 ? "it" : "them"}.`,
    );
  }
  if (input.removed.length > 0) {
    paragraphs.push(
      `${actor} removed you as custodian of: ${input.removed.join(", ")}. You no longer see or work with ${input.removed.length === 1 ? "that fund" : "those funds"}.`,
    );
  }

  await notify({
    event: "fund.assignment_changed",
    entityType: "profiles",
    entityId: input.userId,
    recipients: [recipient],
    subject:
      input.added.length > 0
        ? `You're now the custodian of ${input.added.join(", ")}`
        : `You were removed as custodian of ${input.removed.join(", ")}`,
    content: () => ({
      tone: input.added.length > 0 ? "action" : "info",
      heading: "Your fund assignment changed",
      paragraphs,
      cta: { label: "Open the app", path: "/pcf" },
    }),
  });
}

// -------------------------------------------------------------------- users

export async function notifyUserRoleChanged(userId: string, role: Role, actorId: string) {
  const [recipient, actor] = await Promise.all([recipientById(userId), nameOf(actorId)]);
  if (!recipient) return;
  await notify({
    event: "user.role_changed",
    entityType: "profiles",
    entityId: userId,
    recipients: [recipient],
    subject: `Your PCF role is now ${ROLE_LABELS[role]}`,
    content: () => ({
      tone: "info",
      heading: "Your role changed",
      paragraphs: [
        `${actor} changed your role to ${ROLE_LABELS[role]}. What you can see and do in the app has changed with it.`,
      ],
      cta: { label: "Open the app", path: "/pcf" },
    }),
  });
}

export async function notifyUserAccessChanged(userId: string, active: boolean, actorId: string) {
  const [recipient, actor] = await Promise.all([recipientById(userId), nameOf(actorId)]);
  if (!recipient) return;
  await notify({
    event: "user.access_changed",
    entityType: "profiles",
    entityId: userId,
    recipients: [recipient],
    subject: active
      ? "Your PCF access was restored"
      : "Your PCF access was deactivated",
    content: () => ({
      tone: active ? "info" : "alert",
      heading: active ? "Your access was restored" : "Your access was deactivated",
      paragraphs: [
        active
          ? `${actor} restored your account. You can sign in again.`
          : `${actor} deactivated your account, so you can no longer sign in. Contact an administrator if you think this is a mistake.`,
      ],
      cta: active ? { label: "Open the app", path: "/login" } : undefined,
    }),
  });
}

export type { Recipient };
