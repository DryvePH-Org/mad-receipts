import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const enabled = Boolean(url && anonKey && process.env.RUN_DB_TESTS === 'true');

const DEV_PASSWORD = 'Phase1-Dev-Passw0rd';
const USERS = {
  admin: 'admin@pcf.local',
  custodian: 'custodian@pcf.local',
  approver: 'approver@pcf.local',
} as const;
type Role = keyof typeof USERS;

const clients = {} as Record<Role, SupabaseClient>;
let fundId: string;
let categoryId: string;
let originalThreshold: number;

const LIMIT = 500;
const tag = `vitest-preapproval-${Date.now()}`;

async function sign(role: Role) {
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: USERS[role],
    password: DEV_PASSWORD,
  });
  if (error) throw new Error(`Sign-in failed for ${role}: ${error.message}`);
  clients[role] = client;
}

async function draft(amount: number) {
  const { data, error } = await clients.custodian.rpc('create_voucher', {
    p_fund_id: fundId,
    p_payee: `${tag} payee`,
    p_particulars: tag,
    p_amount: amount,
    p_category_id: categoryId,
    p_no_receipt_reason: 'No official receipt issued (integration test)',
  });
  if (error) throw new Error(error.message);
  return data as string;
}

async function row(id: string) {
  const { data, error } = await clients.custodian
    .from('vouchers')
    .select('status, released_at, submitted_at, reject_reason')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

describe.skipIf(!enabled)('Approve-before-release for large vouchers', () => {
  beforeAll(async () => {
    for (const role of Object.keys(USERS) as Role[]) await sign(role);
    const { data: fund, error } = await clients.admin
      .from('funds')
      .select('id, approval_threshold')
      .eq('name', 'Main Petty Cash')
      .single();
    if (error) throw new Error(error.message);
    fundId = fund.id;
    originalThreshold = Number(fund.approval_threshold);
    const { data: category } = await clients.custodian
      .from('categories')
      .select('id')
      .eq('name', 'Miscellaneous')
      .single();
    categoryId = category!.id;
    const { error: updateError } = await clients.admin
      .from('funds')
      .update({ approval_threshold: LIMIT })
      .eq('id', fundId);
    if (updateError) throw new Error(updateError.message);
  });

  afterAll(async () => {
    await clients.admin
      .from('funds')
      .update({ approval_threshold: originalThreshold })
      .eq('id', fundId);
  });

  it('blocks direct release of a voucher at or above the limit', async () => {
    const id = await draft(LIMIT);
    const { error } = await clients.custodian.rpc('release_voucher', { p_id: id });
    expect(error?.message).toMatch(/needs approver approval/);
  });

  it('refuses to submit a voucher below the limit', async () => {
    const id = await draft(LIMIT - 1);
    const { error } = await clients.custodian.rpc('submit_voucher', { p_id: id });
    expect(error).not.toBeNull();
  });

  it('lets small vouchers keep the release-first flow', async () => {
    const id = await draft(LIMIT - 1);
    const { error } = await clients.custodian.rpc('release_voucher', { p_id: id });
    expect(error).toBeNull();
    expect((await row(id)).status).toBe('released');
  });

  it('submit -> approve -> release moves cash only at the end', async () => {
    const id = await draft(LIMIT);
    expect(
      (await clients.custodian.rpc('submit_voucher', { p_id: id })).error,
    ).toBeNull();
    expect((await row(id)).status).toBe('submitted');

    const early = await clients.custodian.rpc('release_voucher', { p_id: id });
    expect(early.error?.message).toMatch(/waiting for approval/);

    expect(
      (await clients.approver.rpc('approve_voucher', { p_id: id })).error,
    ).toBeNull();
    const approved = await row(id);
    expect(approved.status).toBe('approved');
    expect(approved.released_at).toBeNull();

    expect(
      (await clients.custodian.rpc('release_voucher', { p_id: id })).error,
    ).toBeNull();
    const released = await row(id);
    expect(released.status).toBe('approved');
    expect(released.released_at).not.toBeNull();
  });

  it('returns a declined voucher to draft with the reason', async () => {
    const id = await draft(LIMIT);
    await clients.custodian.rpc('submit_voucher', { p_id: id });
    const { error } = await clients.approver.rpc('return_voucher', {
      p_id: id,
      p_reason: 'Please attach a quotation',
    });
    expect(error).toBeNull();
    const returned = await row(id);
    expect(returned.status).toBe('draft');
    expect(returned.released_at).toBeNull();
    expect(returned.reject_reason).toMatch(/quotation/);
  });
});
