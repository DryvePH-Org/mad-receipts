import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const enabled = Boolean(url && anonKey && process.env.RUN_DB_TESTS === 'true');
const PASSWORD = 'Phase1-Dev-Passw0rd';

function fresh() {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let anon: SupabaseClient;
let custodian: SupabaseClient;
let voucherId: string;

describe.skipIf(!enabled)('Database security', () => {
  beforeAll(async () => {
    anon = fresh();
    custodian = fresh();
    const { error } = await custodian.auth.signInWithPassword({
      email: 'custodian@pcf.local',
      password: PASSWORD,
    });
    if (error) throw new Error(error.message);
    const { data: fund } = await custodian.from('funds').select('id').eq('name', 'Main Petty Cash').single();
    const { data: category } = await custodian.from('categories').select('id').limit(1).single();
    const { data, error: createError } = await custodian.rpc('create_voucher', {
      p_fund_id: fund!.id,
      p_payee: 'vitest security',
      p_particulars: 'vitest security',
      p_amount: 5,
      p_category_id: category!.id,
      p_no_receipt_reason: 'integration test',
    });
    if (createError) throw new Error(createError.message);
    voucherId = data as string;
  });

  it('gives anonymous callers no tables and no functions', async () => {
    for (const table of ['vouchers', 'voucher_items', 'funds', 'profiles', 'audit_log', 'rate_limits']) {
      const { data, error } = await anon.from(table).select('*').limit(1);
      expect(error, table).not.toBeNull();
      expect(data ?? []).toEqual([]);
    }
    const { error } = await anon.rpc('app_role');
    expect(error).not.toBeNull();
  });

  it('keeps the rate limiter away from signed-in users', async () => {
    const { error } = await custodian.rpc('check_rate_limit', {
      p_key: 'x', p_limit: 1, p_window_seconds: 60,
    });
    expect(error).not.toBeNull();
    const { error: tableError } = await custodian.from('rate_limits').select('*').limit(1);
    expect(tableError).not.toBeNull();
  });

  it('refuses oversized or control-character text even on a direct write', async () => {
    const tooLong = await custodian.from('vouchers').update({ payee: 'x'.repeat(121) }).eq('id', voucherId);
    expect(tooLong.error?.message).toMatch(/safe_text|check constraint/i);
    const control = await custodian.from('vouchers').update({ payee: 'bad\u0007name' }).eq('id', voucherId);
    expect(control.error?.message).toMatch(/safe_text|check constraint/i);
    const fine = await custodian.from('vouchers').update({ payee: "O'Neil & Sons" }).eq('id', voucherId);
    expect(fine.error).toBeNull();
  });

  it('treats SQL-looking input as plain text', async () => {
    const nasty = "Robert'); DROP TABLE vouchers;--";
    const { error } = await custodian.from('vouchers').update({ payee: nasty }).eq('id', voucherId);
    expect(error).toBeNull();
    const { data } = await custodian.from('vouchers').select('payee').eq('id', voucherId).single();
    expect(data!.payee).toBe(nasty);
    const { error: stillThere } = await custodian.from('vouchers').select('id').limit(1);
    expect(stillThere).toBeNull();
  });

  it('rejects non-numeric and extreme line values in the RPC', async () => {
    const { data: fund } = await custodian.from('funds').select('id').eq('name', 'Main Petty Cash').single();
    const { data: category } = await custodian.from('categories').select('id').limit(1).single();
    const base = { p_fund_id: fund!.id, p_payee: 'x' };
    for (const amount of ['abc', '1e308', null, -5]) {
      const { error } = await custodian.rpc('create_voucher_lines', {
        ...base,
        p_items: [{ particulars: 'p', amount, category_id: category!.id }],
      });
      expect(error, String(amount)).not.toBeNull();
    }
    const { error } = await custodian.rpc('create_voucher_lines', {
      ...base,
      p_items: [{ particulars: 'p', amount: 1, category_id: 'not-a-uuid' }],
    });
    expect(error?.message).toMatch(/category/i);
  });
});
