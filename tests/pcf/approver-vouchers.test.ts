import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const enabled = Boolean(url && anonKey && process.env.RUN_DB_TESTS === 'true');
const PASSWORD = 'Phase1-Dev-Passw0rd';

const clients = {} as Record<'admin' | 'custodian' | 'approver' | 'accounting', SupabaseClient>;
let fundId: string;
let categoryId: string;
let originalThreshold: number;

async function sign(role: keyof typeof clients) {
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: `${role}@pcf.local`, password: PASSWORD });
  if (error) throw new Error(error.message);
  clients[role] = client;
}

const item = (amount: number) => [{ particulars: 'vitest approver', amount, category_id: categoryId }];

describe.skipIf(!enabled)('Approvers preparing their own vouchers', () => {
  beforeAll(async () => {
    for (const role of ['admin', 'custodian', 'approver', 'accounting'] as const) await sign(role);
    const { data: fund } = await clients.admin.from('funds').select('id, approval_threshold').eq('name', 'Main Petty Cash').single();
    fundId = fund!.id;
    originalThreshold = Number(fund!.approval_threshold);
    const { data: cat } = await clients.custodian.from('categories').select('id').limit(1).single();
    categoryId = cat!.id;
    await clients.admin.from('funds').update({ approval_threshold: 500 }).eq('id', fundId);
  });
  afterAll(async () => {
    await clients.admin.from('funds').update({ approval_threshold: originalThreshold }).eq('id', fundId);
  });

  const create = (who: 'approver' | 'accounting', amount: number) =>
    clients[who].rpc('create_voucher_lines', { p_fund_id: fundId, p_payee: 'vitest', p_items: item(amount), p_no_receipt_reason: 'integration test' });

  it('lets an approver create, edit and release a small voucher of their own', async () => {
    const { data: id, error } = await create('approver', 20);
    expect(error).toBeNull();
    const edit = await clients.approver.rpc('update_voucher_lines', { p_id: id, p_payee: 'vitest edited', p_items: item(25) });
    expect(edit.error).toBeNull();
    expect((await clients.approver.rpc('release_voucher', { p_id: id })).error).toBeNull();
  });

  it('keeps accounting out', async () => {
    const { error } = await create('accounting', 20);
    expect(error?.message).toMatch(/Not authorized/);
  });

  it('cannot approve their own large voucher; another approver or admin can', async () => {
    const { data: id } = await create('approver', 600);
    expect((await clients.approver.rpc('submit_voucher', { p_id: id })).error).toBeNull();
    const own = await clients.approver.rpc('approve_voucher', { p_id: id });
    expect(own.error).not.toBeNull();
    expect((await clients.admin.rpc('approve_voucher', { p_id: id })).error).toBeNull();
    expect((await clients.approver.rpc('release_voucher', { p_id: id })).error).toBeNull();
  });

  it("cannot touch someone else's voucher", async () => {
    const { data: id } = await clients.custodian.rpc('create_voucher_lines', {
      p_fund_id: fundId, p_payee: 'vitest', p_items: item(10), p_no_receipt_reason: 'integration test',
    });
    expect((await clients.approver.rpc('release_voucher', { p_id: id })).error?.message).toMatch(/your own/i);
    expect((await clients.approver.rpc('update_voucher_lines', { p_id: id, p_payee: 'x', p_items: item(1) })).error).not.toBeNull();
    expect((await clients.approver.rpc('void_voucher', { p_id: id, p_reason: 'nope' })).error).not.toBeNull();
  });

  it('lets an approver upload a photo for their own voucher', async () => {
    const { data: id } = await create('approver', 15);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const path = `${fundId}/${id}/approver-test.png`;
    const { error } = await clients.approver.storage.from('receipts').upload(path, png, { contentType: 'image/png' });
    expect(error).toBeNull();
    await clients.approver.storage.from('receipts').remove([path]);
  });
});
