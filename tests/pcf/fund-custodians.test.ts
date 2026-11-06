import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Opt-in: writes a throwaway fund, custodian, vouchers, and receipt to the
// database in .env.local, then removes them.
const enabled = Boolean(
  url && anonKey && serviceKey && process.env.RUN_DB_TESTS === 'true',
);

const DEV_PASSWORD = 'Phase1-Dev-Passw0rd';
const runTag = `vitest-funds-${Date.now()}`;
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const clients: Record<string, SupabaseClient> = {};
let service: SupabaseClient;
let mainFundId: string;
let otherFundId: string;
let categoryId: string;
let secondCustodianId: string;
let seededCustodianId: string;
let receiptPath: string;

function newClient() {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string, password = DEV_PASSWORD) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

describe.skipIf(!enabled)('Fund-specific custodians', () => {
  beforeAll(async () => {
    service = createClient(url!, serviceKey!, { auth: { persistSession: false } });

    clients.admin = await signIn('admin@pcf.local');
    clients.custodian = await signIn('custodian@pcf.local');
    clients.approver = await signIn('approver@pcf.local');
    clients.accounting = await signIn('accounting@pcf.local');

    const { data: main } = await clients.admin
      .from('funds')
      .select('id')
      .eq('name', 'Main Petty Cash')
      .single();
    mainFundId = main!.id;
    const { data: seededProfile } = await clients.admin
      .from('profiles')
      .select('id')
      .eq('pcf_role', 'custodian')
      .eq('full_name', 'PCF Custodian')
      .single();
    seededCustodianId = seededProfile!.id;
    // Start from the documented seed: this custodian holds the main fund.
    await service
      .from('fund_custodians')
      .upsert({ fund_id: mainFundId, custodian_id: seededCustodianId });

    const { data: category } = await clients.admin
      .from('categories')
      .select('id')
      .eq('name', 'Miscellaneous')
      .single();
    categoryId = category!.id;

    const { data: created, error: userError } = await service.auth.admin.createUser({
      email: `${runTag}@pcf.local`,
      password: DEV_PASSWORD,
      email_confirm: true,
    });
    if (userError) throw userError;
    secondCustodianId = created.user.id;
    await service
      .from('profiles')
      .update({ full_name: `${runTag} custodian`, pcf_role: 'custodian' })
      .eq('id', secondCustodianId);
    clients.custodian2 = await signIn(`${runTag}@pcf.local`);

    const { data: fund, error: fundError } = await service
      .from('funds')
      .insert({ name: `${runTag} fund`, amount: 5000, per_txn_limit: 500 })
      .select('id')
      .single();
    if (fundError) throw fundError;
    otherFundId = fund.id;

    receiptPath = `${otherFundId}/${runTag}/receipt.png`;
    const { error: uploadError } = await service.storage
      .from('receipts')
      .upload(receiptPath, ONE_PIXEL_PNG, { contentType: 'image/png' });
    if (uploadError) throw uploadError;
  });

  afterAll(async () => {
    if (!service) return;
    await service.storage.from('receipts').remove([receiptPath]);
    await service.from('cash_counts').delete().eq('fund_id', otherFundId);
    await service.from('vouchers').delete().eq('fund_id', otherFundId);
    await service.from('fund_counters').delete().eq('fund_id', otherFundId);
    await service.from('funds').delete().eq('id', otherFundId);
    await service.auth.admin.deleteUser(secondCustodianId);
  });

  async function assign(userId: string, fundIds: string[]) {
    return clients.admin.rpc('assign_custodian_funds', {
      p_user_id: userId,
      p_fund_ids: fundIds,
    });
  }

  it('lets only admins assign funds, and only to active custodians', async () => {
    const asCustodian = await clients.custodian.rpc('assign_custodian_funds', {
      p_user_id: seededCustodianId,
      p_fund_ids: [mainFundId],
    });
    expect(asCustodian.error?.message).toMatch(/Not authorized/);

    const { data: approver } = await clients.approver.rpc('app_role');
    expect(approver).toBe('approver');
    const { data: approverProfile } = await clients.admin
      .from('profiles')
      .select('id')
      .eq('pcf_role', 'approver')
      .limit(1)
      .single();
    const toApprover = await assign(approverProfile!.id, [otherFundId]);
    expect(toApprover.error?.message).toMatch(/active custodian/);
  });

  it('hides an unassigned fund from custodians and blocks acting on it', async () => {
    const { data: visible } = await clients.custodian
      .from('funds')
      .select('id')
      .eq('id', otherFundId);
    expect(visible).toEqual([]);

    const { error: voucherError } = await clients.custodian.rpc('create_voucher', {
      p_fund_id: otherFundId,
      p_payee: runTag,
      p_particulars: runTag,
      p_amount: 10,
      p_category_id: categoryId,
      p_no_receipt_reason: 'test',
    });
    expect(voucherError?.message).toMatch(/not a custodian of this fund/);

    const { error: countError } = await clients.custodian.rpc('record_cash_count', {
      p_fund_id: otherFundId,
      p_counted: 5000,
    });
    expect(countError?.message).toMatch(/not a custodian of this fund/);

    const { error: replError } = await clients.custodian.rpc('create_replenishment', {
      p_fund_id: otherFundId,
    });
    expect(replError?.message).toMatch(/not a custodian of this fund/);
  });

  it('gives a custodian access once the fund is assigned', async () => {
    const { error } = await assign(secondCustodianId, [otherFundId]);
    expect(error).toBeNull();

    const { data: fund } = await clients.custodian2
      .from('funds')
      .select('id')
      .eq('id', otherFundId)
      .single();
    expect(fund?.id).toBe(otherFundId);

    const { data: voucherId, error: voucherError } = await clients.custodian2.rpc(
      'create_voucher',
      {
        p_fund_id: otherFundId,
        p_payee: `${runTag} payee`,
        p_particulars: runTag,
        p_amount: 25,
        p_category_id: categoryId,
        p_no_receipt_reason: 'test',
      },
    );
    expect(voucherError).toBeNull();

    const { error: releaseError } = await clients.custodian2.rpc('release_voucher', {
      p_id: voucherId,
    });
    expect(releaseError).toBeNull();
  });

  it('keeps each custodian out of the other custodian\'s records', async () => {
    const { data: ownVouchers } = await clients.custodian
      .from('vouchers')
      .select('fund_id')
      .eq('fund_id', otherFundId);
    expect(ownVouchers).toEqual([]);

    const { data: otherVouchers } = await clients.custodian2
      .from('vouchers')
      .select('fund_id')
      .eq('fund_id', mainFundId);
    expect(otherVouchers).toEqual([]);

    const { data: balances } = await clients.custodian
      .from('fund_balance_v')
      .select('fund_id');
    expect(balances?.map((row) => row.fund_id)).not.toContain(otherFundId);
    expect(balances?.map((row) => row.fund_id)).toContain(mainFundId);
  });

  it('shows every fund to admin, approver, and accounting', async () => {
    for (const role of ['admin', 'approver', 'accounting']) {
      const { data } = await clients[role].from('funds').select('id');
      const ids = data?.map((row) => row.id) ?? [];
      expect(ids, role).toContain(mainFundId);
      expect(ids, role).toContain(otherFundId);
    }
  });

  it('protects receipt photos the same way', async () => {
    const blocked = await clients.custodian.storage.from('receipts').download(receiptPath);
    expect(blocked.error).not.toBeNull();

    const allowed = await clients.custodian2.storage.from('receipts').download(receiptPath);
    expect(allowed.error).toBeNull();

    const approver = await clients.approver.storage.from('receipts').download(receiptPath);
    expect(approver.error).toBeNull();
  });

  it('lets several custodians share a fund without taking it from each other', async () => {
    const shared = await assign(seededCustodianId, [mainFundId, otherFundId]);
    expect(shared.error).toBeNull();

    const { data: holders } = await service
      .from('fund_custodians')
      .select('custodian_id')
      .eq('fund_id', otherFundId);
    expect(holders?.map((row) => row.custodian_id).sort()).toEqual(
      [seededCustodianId, secondCustodianId].sort(),
    );

    // Both can work on the shared fund.
    for (const who of ['custodian', 'custodian2']) {
      const { data: visible } = await clients[who].from('funds').select('id').eq('id', otherFundId);
      expect(visible?.length, who).toBe(1);
    }

    // Removing one custodian leaves the other in place.
    const cleared = await assign(secondCustodianId, []);
    expect(cleared.error).toBeNull();
    const { data: left } = await service
      .from('fund_custodians')
      .select('custodian_id')
      .eq('fund_id', otherFundId);
    expect(left?.map((row) => row.custodian_id)).toEqual([seededCustodianId]);

    // Put the seeded custodian back to owning only the main fund.
    const restored = await assign(seededCustodianId, [mainFundId]);
    expect(restored.error).toBeNull();
  });

  it('sets a fund\'s custodians in one go, admins only, active custodians only', async () => {
    const asCustodian = await clients.custodian.rpc('set_fund_custodians', {
      p_fund_id: otherFundId,
      p_custodian_ids: [secondCustodianId],
    });
    expect(asCustodian.error?.message).toMatch(/Not authorized/);

    const { data: approverProfile } = await clients.admin
      .from('profiles')
      .select('id')
      .eq('pcf_role', 'approver')
      .limit(1)
      .single();
    const bad = await clients.admin.rpc('set_fund_custodians', {
      p_fund_id: otherFundId,
      p_custodian_ids: [approverProfile!.id],
    });
    expect(bad.error?.message).toMatch(/active custodian/);

    const ok = await clients.admin.rpc('set_fund_custodians', {
      p_fund_id: otherFundId,
      p_custodian_ids: [seededCustodianId, secondCustodianId],
    });
    expect(ok.error).toBeNull();
    const { data: holders } = await service
      .from('fund_custodians')
      .select('custodian_id')
      .eq('fund_id', otherFundId);
    expect(holders?.length).toBe(2);

    const none = await clients.admin.rpc('set_fund_custodians', {
      p_fund_id: otherFundId,
      p_custodian_ids: [],
    });
    expect(none.error).toBeNull();
    const { data: empty } = await service
      .from('fund_custodians')
      .select('custodian_id')
      .eq('fund_id', otherFundId);
    expect(empty).toEqual([]);
  });

});
