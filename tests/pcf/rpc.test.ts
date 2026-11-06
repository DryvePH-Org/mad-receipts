import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Opt-in only: these tests write vouchers and replenishments to a real
// database. CI leaves them skipped because RUN_DB_TESTS is never set there.
const enabled = Boolean(url && anonKey && process.env.RUN_DB_TESTS === 'true');

// Dev-only credentials from supabase/seed.sql.
const DEV_PASSWORD = 'Phase1-Dev-Passw0rd';
const USERS = {
  admin: 'admin@pcf.local',
  custodian: 'custodian@pcf.local',
  approver: 'approver@pcf.local',
  accounting: 'accounting@pcf.local',
} as const;
type Role = keyof typeof USERS;

const clients = {} as Record<Role, SupabaseClient>;
let anon: SupabaseClient;
let fundId: string;
let categoryId: string;
let closedVoucherId: string;

const runTag = `vitest-${Date.now()}`;

function newClient() {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function makeVoucher(role: Role, amount: number, withReceiptReason = true) {
  const { data, error } = await clients[role].rpc('create_voucher', {
    p_fund_id: fundId,
    p_payee: `${runTag} payee`,
    p_particulars: `${runTag} voucher`,
    p_amount: amount,
    p_category_id: categoryId,
    p_no_receipt_reason: withReceiptReason
      ? 'No official receipt issued (integration test)'
      : null,
  });
  if (error) throw new Error(`create_voucher failed: ${error.message}`);
  return data as string;
}

async function getVoucher(id: string) {
  const { data, error } = await clients.custodian
    .from('vouchers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(`voucher read failed: ${error.message}`);
  return data;
}

async function balance() {
  const { data, error } = await clients.custodian
    .from('fund_balance_v')
    .select('*')
    .eq('fund_id', fundId)
    .single();
  if (error) throw new Error(`balance read failed: ${error.message}`);
  return {
    fundAmount: Number(data.fund_amount),
    expectedCash: Number(data.expected_cash),
    releasedTotal: Number(data.released_vouchers_total),
    isLow: data.is_low,
  };
}

describe.skipIf(!enabled)('Voucher workflow contract', () => {
  beforeAll(async () => {
    anon = newClient();

    for (const role of Object.keys(USERS) as Role[]) {
      const client = newClient();
      const { error } = await client.auth.signInWithPassword({
        email: USERS[role],
        password: DEV_PASSWORD,
      });
      if (error) {
        throw new Error(
          `Sign-in failed for ${role}: ${error.message}. Run supabase/seed.sql first.`,
        );
      }
      clients[role] = client;
    }

    const { data: fund, error: fundError } = await clients.custodian
      .from('funds')
      .select('id')
      .eq('name', 'Main Petty Cash')
      .single();
    if (fundError) throw new Error(`Seed fund missing: ${fundError.message}`);
    fundId = fund.id;

    const { data: category, error: categoryError } = await clients.custodian
      .from('categories')
      .select('id')
      .eq('name', 'Miscellaneous')
      .single();
    if (categoryError) throw new Error(`Seed category missing: ${categoryError.message}`);
    categoryId = category.id;
  });

  it('keeps the imprest equation true', async () => {
    const { fundAmount, expectedCash, releasedTotal } = await balance();
    expect(expectedCash + releasedTotal).toBeCloseTo(fundAmount, 2);
  });

  it('rejects calls from the wrong role', async () => {
    const { error: approverCreate } = await clients.accounting.rpc('create_voucher', {
      p_fund_id: fundId,
      p_payee: runTag,
      p_particulars: runTag,
      p_amount: 1,
      p_category_id: categoryId,
    });
    expect(approverCreate?.message).toMatch(/Not authorized/);

    const { error: accountingApprove } = await clients.accounting.rpc('approve_voucher', {
      p_id: fundId,
    });
    expect(accountingApprove?.message).toMatch(/Not authorized/);

    const { error: approverReview } = await clients.approver.rpc('review_replenishment', {
      p_id: fundId,
      p_approve: true,
    });
    expect(approverReview?.message).toMatch(/Not authorized/);
  });

  it('enforces the per-transaction limit', async () => {
    const { error } = await clients.custodian.rpc('create_voucher', {
      p_fund_id: fundId,
      p_payee: runTag,
      p_particulars: runTag,
      p_amount: 1000.01,
      p_category_id: categoryId,
    });
    expect(error?.message).toMatch(/per-transaction limit/);
  });

  it('requires a receipt or a no-receipt reason before release', async () => {
    const id = await makeVoucher('custodian', 25, false);
    expect((await getVoucher(id)).pcv_number).toMatch(/^PCV-\d{4}-\d{4}$/);

    const { error: releaseWithout } = await clients.custodian.rpc('release_voucher', { p_id: id });
    expect(releaseWithout?.message).toMatch(/receipt|reason/i);

    const { data: edited, error: editError } = await clients.custodian
      .from('vouchers')
      .update({ no_receipt_reason: 'Small purchase, no official receipt' })
      .eq('id', id)
      .select('id');
    expect(editError).toBeNull();
    expect(edited).toHaveLength(1);

    const { error: releaseError } = await clients.custodian.rpc('release_voucher', { p_id: id });
    expect(releaseError).toBeNull();
    const released = await getVoucher(id);
    expect(released.status).toBe('released');
    expect(released.released_at).not.toBeNull();
  });

  it('denies direct status writes but allows descriptive edits on drafts', async () => {
    const id = await makeVoucher('custodian', 15);

    const { error: statusError } = await clients.custodian
      .from('vouchers')
      .update({ status: 'released' })
      .eq('id', id);
    expect(statusError).not.toBeNull();

    const { data: edited, error: editError } = await clients.custodian
      .from('vouchers')
      .update({ payee: `${runTag} edited payee` })
      .eq('id', id)
      .select('id, payee');
    expect(editError).toBeNull();
    expect(edited).toHaveLength(1);
    expect(edited![0].payee).toBe(`${runTag} edited payee`);

    // Lines and totals are written only through the RPC, so they cannot drift.
    const { error: lineEditError } = await clients.custodian
      .from('vouchers')
      .update({ particulars: `${runTag} edited particulars` })
      .eq('id', id);
    expect(lineEditError).not.toBeNull();

    // Released vouchers are financial records: descriptive edits stop working.
    const releasedId = await makeVoucher('custodian', 15);
    expect((await clients.custodian.rpc('release_voucher', { p_id: releasedId })).error).toBeNull();
    const { data: locked } = await clients.custodian
      .from('vouchers')
      .update({ payee: `${runTag} not allowed` })
      .eq('id', releasedId)
      .select('id');
    expect(locked).toEqual([]);
  });

  it('reviews released vouchers and blocks self-approval even for admins', async () => {
    const id = await makeVoucher('admin', 20);
    expect((await clients.admin.rpc('release_voucher', { p_id: id })).error).toBeNull();

    const { error: selfApproval } = await clients.admin.rpc('approve_voucher', { p_id: id });
    expect(selfApproval?.message).toMatch(/cannot approve a voucher you prepared/);

    const { error: approved } = await clients.approver.rpc('approve_voucher', { p_id: id });
    expect(approved).toBeNull();
    const row = await getVoucher(id);
    expect(row.status).toBe('approved');
    expect(row.approved_at).not.toBeNull();
  });

  it('flags a released voucher without removing its cash', async () => {
    const id = await makeVoucher('custodian', 30);
    expect((await clients.custodian.rpc('release_voucher', { p_id: id })).error).toBeNull();
    const before = await balance();

    const { error: noReason } = await clients.approver.rpc('reject_voucher', {
      p_id: id,
      p_reason: '   ',
    });
    expect(noReason?.message).toMatch(/reason/i);

    const { error: rejectError } = await clients.approver.rpc('reject_voucher', {
      p_id: id,
      p_reason: 'Attach the missing receipt',
    });
    expect(rejectError).toBeNull();

    const rejected = await getVoucher(id);
    expect(rejected.status).toBe('rejected');
    expect(rejected.reject_reason).toBe('Attach the missing receipt');

    // The money is already out, so the imprest equation must not move.
    const after = await balance();
    expect(after.expectedCash).toBeCloseTo(before.expectedCash, 2);
    expect(after.releasedTotal).toBeCloseTo(before.releasedTotal, 2);

    const { data: edited } = await clients.custodian
      .from('vouchers')
      .update({ no_receipt_reason: 'Receipt was lost' })
      .eq('id', id)
      .select('id');
    expect(edited).toEqual([]);

    expect((await clients.approver.rpc('approve_voucher', { p_id: id })).error).toBeNull();
    const reapproved = await getVoucher(id);
    expect(reapproved.status).toBe('approved');
    expect(reapproved.reject_reason).toBeNull();
  });

  it('releases before approval and closes replenishment without waiting for reviews', async () => {
    const before = await balance();
    const id = await makeVoucher('custodian', 50);
    expect((await clients.custodian.rpc('release_voucher', { p_id: id })).error).toBeNull();
    expect((await clients.approver.rpc('approve_voucher', { p_id: id })).error).toBeNull();

    const unreviewedId = await makeVoucher('custodian', 25);
    expect((await clients.custodian.rpc('release_voucher', { p_id: unreviewedId })).error).toBeNull();

    const { error: releaseAgain } = await clients.custodian.rpc('release_voucher', { p_id: id });
    expect(releaseAgain?.message).toMatch(/cannot be released from status approved/);

    const afterRelease = await balance();
    expect(afterRelease.expectedCash).toBeCloseTo(before.expectedCash - 75, 2);
    expect(afterRelease.releasedTotal).toBeCloseTo(before.releasedTotal + 75, 2);

    const { data: replId, error: replError } = await clients.custodian.rpc(
      'create_replenishment',
      { p_fund_id: fundId },
    );
    expect(replError).toBeNull();

    const { error: reviewByCustodian } = await clients.custodian.rpc('review_replenishment', {
      p_id: replId,
      p_approve: true,
    });
    expect(reviewByCustodian?.message).toMatch(/Not authorized/);

    const { error: closeDraft } = await clients.accounting.rpc('close_replenishment', {
      p_id: replId,
    });
    expect(closeDraft?.message).toMatch(/cannot be closed from status draft/);

    expect((await clients.custodian.rpc('submit_replenishment', { p_id: replId })).error).toBeNull();

    const { error: rejectNoNote } = await clients.accounting.rpc('review_replenishment', {
      p_id: replId,
      p_approve: false,
      p_note: ' ',
    });
    expect(rejectNoNote?.message).toMatch(/note/i);

    const { error: rejectError } = await clients.accounting.rpc('review_replenishment', {
      p_id: replId,
      p_approve: false,
      p_note: 'Please re-check totals',
    });
    expect(rejectError).toBeNull();
    expect((await getVoucher(id)).replenishment_id).toBeNull();

    const { data: repl2Id, error: repl2Error } = await clients.custodian.rpc(
      'create_replenishment',
      { p_fund_id: fundId },
    );
    expect(repl2Error).toBeNull();
    expect((await clients.custodian.rpc('submit_replenishment', { p_id: repl2Id })).error).toBeNull();
    expect(
      (
        await clients.accounting.rpc('review_replenishment', {
          p_id: repl2Id,
          p_approve: true,
          p_note: 'Verified',
        })
      ).error,
    ).toBeNull();

    const { data: repl2 } = await clients.custodian
      .from('replenishments')
      .select('total')
      .eq('id', repl2Id)
      .single();
    const replTotal = Number(repl2!.total);

    // Close without reviewing every voucher: accounting alone can restore the fund.
    expect((await clients.accounting.rpc('close_replenishment', { p_id: repl2Id })).error).toBeNull();

    const closed = await getVoucher(id);
    expect(closed.status).toBe('closed');
    closedVoucherId = closed.id;

    const closedUnreviewed = await getVoucher(unreviewedId);
    expect(closedUnreviewed.status).toBe('closed');

    const afterClose = await balance();
    expect(afterClose.expectedCash).toBeCloseTo(afterRelease.expectedCash + replTotal, 2);
    expect(afterClose.expectedCash + afterClose.releasedTotal).toBeCloseTo(
      afterClose.fundAmount,
      2,
    );

    const { error: releaseClosed } = await clients.custodian.rpc('release_voucher', { p_id: id });
    expect(releaseClosed?.message).toMatch(/cannot be released from status closed/);
  });

  it('refuses to create an empty replenishment', async () => {
    const { error } = await clients.custodian.rpc('create_replenishment', { p_fund_id: fundId });
    expect(error?.message).toMatch(/No released vouchers/);
  });

  it('enforces void rules', async () => {
    const draftId = await makeVoucher('custodian', 12);
    const { error: noReason } = await clients.custodian.rpc('void_voucher', {
      p_id: draftId,
      p_reason: '',
    });
    expect(noReason?.message).toMatch(/reason/i);

    const { error: voidError } = await clients.custodian.rpc('void_voucher', {
      p_id: draftId,
      p_reason: 'Duplicate entry',
    });
    expect(voidError).toBeNull();
    expect((await getVoucher(draftId)).status).toBe('void');

    const releasedId = await makeVoucher('custodian', 12);
    expect((await clients.custodian.rpc('release_voucher', { p_id: releasedId })).error).toBeNull();

    const { error: ownReleased } = await clients.custodian.rpc('void_voucher', {
      p_id: releasedId,
      p_reason: 'Wrong payee',
    });
    expect(ownReleased?.message).toMatch(/can only void drafts/i);

    const { error: adminVoid } = await clients.admin.rpc('void_voucher', {
      p_id: releasedId,
      p_reason: 'Cancelled by admin',
    });
    expect(adminVoid).toBeNull();
    expect((await getVoucher(releasedId)).status).toBe('void');

    const approverVoidId = await makeVoucher('custodian', 5);
    const { error: approverVoid } = await clients.approver.rpc('void_voucher', {
      p_id: approverVoidId,
      p_reason: 'Not mine to void',
    });
    expect(approverVoid?.message).toMatch(/your own vouchers/);

    const { error: closedVoid } = await clients.admin.rpc('void_voucher', {
      p_id: closedVoucherId,
      p_reason: 'Too late',
    });
    expect(closedVoid?.message).toMatch(/Closed vouchers cannot be voided/);
  });

  it('records cash counts and requires a note on variance', async () => {
    const { expectedCash } = await balance();

    expect(
      (
        await clients.custodian.rpc('record_cash_count', {
          p_fund_id: fundId,
          p_counted: expectedCash,
        })
      ).error,
    ).toBeNull();

    const { error: missingNote } = await clients.custodian.rpc('record_cash_count', {
      p_fund_id: fundId,
      p_counted: expectedCash - 5,
    });
    expect(missingNote?.message).toMatch(/note/i);

    const { data: countId, error: varianceError } = await clients.custodian.rpc(
      'record_cash_count',
      {
        p_fund_id: fundId,
        p_counted: expectedCash - 5,
        p_note: 'Short by 5 (integration test)',
      },
    );
    expect(varianceError).toBeNull();

    const { data: row } = await clients.custodian
      .from('cash_counts')
      .select('*')
      .eq('id', countId)
      .single();
    expect(Number(row!.expected_cash)).toBeCloseTo(expectedCash, 2);
    expect(Number(row!.variance)).toBeCloseTo(-5, 2);
  });

  it('hides the audit log from custodians and shows it to accounting', async () => {
    const { data: custodianRows } = await clients.custodian
      .from('audit_log')
      .select('id')
      .limit(5);
    expect(custodianRows).toEqual([]);

    const { data: accountingRows, error: accountingError } = await clients.accounting
      .from('audit_log')
      .select('id, action')
      .eq('entity_id', closedVoucherId)
      .eq('action', 'status_change');
    expect(accountingError).toBeNull();
    expect((accountingRows ?? []).length).toBeGreaterThan(0);
  });

  it('denies anonymous reads', async () => {
    const { error } = await anon.from('vouchers').select('id').limit(1);
    expect(error).not.toBeNull();
  });

  it('still holds the imprest equation at the end', async () => {
    const { fundAmount, expectedCash, releasedTotal } = await balance();
    expect(expectedCash + releasedTotal).toBeCloseTo(fundAmount, 2);
  });
});
