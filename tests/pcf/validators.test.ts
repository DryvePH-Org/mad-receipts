import { describe, expect, it } from 'vitest';

import { cashCountSchema } from '@/lib/pcf/validators/cash-count';
import {
  createReplenishmentSchema,
  replenishmentReviewSchema,
} from '@/lib/pcf/validators/replenishment';
import {
  createCategorySchema,
  renameCategorySchema,
  setCategoryActiveSchema,
} from '@/lib/pcf/validators/category';
import { fundFormSchema, saveFundSchema } from '@/lib/pcf/validators/fund';
import {
  createVoucherSchema,
  noReceiptReasonSchema,
  receiptPathSchema,
  voucherReasonSchema,
} from '@/lib/pcf/validators/voucher';
import { cleanText, labelText, personName, text } from '@/lib/pcf/validators/text';
import { isVoucherStatus } from '@/lib/pcf/voucher-status';

const validFund = {
  name: 'Main Petty Cash',
  amount: '10000.00',
  per_txn_limit: '1000.00',
  approval_threshold: '3000.00',
  low_balance_pct: 25,
  custodian_ids: [] as string[],
};

describe('fundFormSchema', () => {
  it('accepts a valid fund', () => {
    expect(fundFormSchema.safeParse(validFund).success).toBe(true);
  });

  it('accepts a uuid custodian', () => {
    expect(
      fundFormSchema.safeParse({
        ...validFund,
        custodian_ids: ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'],
      }).success,
    ).toBe(true);
  });

  it('rejects a per-transaction limit above the fund amount', () => {
    const result = fundFormSchema.safeParse({
      ...validFund,
      per_txn_limit: '10000.01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/cannot exceed/i);
    }
  });

  it('rejects zero, negative, and over-precise money', () => {
    for (const amount of ['0', '0.00', '-5', '10.001', '1,000']) {
      expect(
        fundFormSchema.safeParse({ ...validFund, amount }).success,
        amount,
      ).toBe(false);
    }
  });

  it('rejects an invalid custodian id and low-balance percentage', () => {
    expect(
      fundFormSchema.safeParse({ ...validFund, custodian_ids: ['nobody'] })
        .success,
    ).toBe(false);
    expect(
      fundFormSchema.safeParse({ ...validFund, low_balance_pct: 0 }).success,
    ).toBe(false);
    expect(
      fundFormSchema.safeParse({ ...validFund, low_balance_pct: 101 }).success,
    ).toBe(false);
    expect(
      fundFormSchema.safeParse({ ...validFund, low_balance_pct: 25.5 }).success,
    ).toBe(false);
  });

  it('allows the confirmation flag on save', () => {
    expect(
      saveFundSchema.safeParse({
        ...validFund,
        id: '00000000-0000-4000-8000-0000000000aa',
        confirmAmountChange: true,
      }).success,
    ).toBe(true);
  });
});

describe('cashCountSchema', () => {
  const validCount = {
    fund_id: '00000000-0000-4000-8000-000000000001',
    counted: '10000.00',
    note: '',
  };

  it('accepts a zero or positive count and trims the note', () => {
    expect(cashCountSchema.safeParse(validCount).success).toBe(true);
    expect(cashCountSchema.safeParse({ ...validCount, counted: '0' }).success).toBe(
      true,
    );
    expect(
      cashCountSchema.parse({ ...validCount, note: '  Short by one bay  ' }).note,
    ).toBe('Short by one bay');
  });

  it('rejects negative, over-precise, and malformed amounts', () => {
    for (const counted of ['-1', '10.001', '1,000', '', 'abc']) {
      expect(cashCountSchema.safeParse({ ...validCount, counted }).success).toBe(
        false,
      );
    }
  });

  it('rejects a missing fund and an overlong note', () => {
    expect(
      cashCountSchema.safeParse({ ...validCount, fund_id: 'main' }).success,
    ).toBe(false);
    expect(
      cashCountSchema.safeParse({ ...validCount, note: 'x'.repeat(301) })
        .success,
    ).toBe(false);
  });
});

describe('replenishment schemas', () => {
  const validReview = {
    replenishment_id: '00000000-0000-4000-8000-000000000003',
    approve: true,
    note: '',
  };

  it('accepts a valid fund and an approval without a note', () => {
    expect(
      createReplenishmentSchema.safeParse({
        fund_id: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true);
    expect(replenishmentReviewSchema.safeParse(validReview).success).toBe(true);
    expect(
      createReplenishmentSchema.safeParse({ fund_id: 'main' }).success,
    ).toBe(false);
  });

  it('requires a note when rejecting', () => {
    const result = replenishmentReviewSchema.safeParse({
      ...validReview,
      approve: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['note']);
    }
    expect(
      replenishmentReviewSchema.safeParse({
        ...validReview,
        approve: false,
        note: 'Totals do not match',
      }).success,
    ).toBe(true);
  });

  it('trims the note and rejects an overlong one', () => {
    const parsed = replenishmentReviewSchema.parse({
      ...validReview,
      approve: false,
      note: '  Please re-check  ',
    });
    expect(parsed.note).toBe('Please re-check');
    expect(
      replenishmentReviewSchema.safeParse({
        ...validReview,
        note: 'x'.repeat(301),
      }).success,
    ).toBe(false);
  });
});

describe('category schemas', () => {
  it('trims and requires a name', () => {
    expect(createCategorySchema.parse({ name: '  Supplies ' }).name).toBe(
      'Supplies',
    );
    expect(createCategorySchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(
      createCategorySchema.safeParse({ name: 'x'.repeat(61) }).success,
    ).toBe(false);
  });

  it('validates ids and active flags', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(renameCategorySchema.safeParse({ id, name: 'Travel' }).success).toBe(
      true,
    );
    expect(renameCategorySchema.safeParse({ id: 'x', name: 'Travel' }).success).toBe(
      false,
    );
    expect(setCategoryActiveSchema.safeParse({ id, isActive: false }).success).toBe(
      true,
    );
  });
});

describe('voucher schemas', () => {
  const validVoucher = {
    fund_id: '00000000-0000-4000-8000-000000000001',
    voucher_date: '2026-10-31',
    payee: 'Ana Cruz',
    items: [
      {
        particulars: 'Printer paper and ink',
        amount: '1250.50',
        category_id: '00000000-0000-4000-8000-000000000002',
      },
    ],
    no_receipt_reason: '',
  };

  it('accepts a valid voucher', () => {
    expect(createVoucherSchema.safeParse(validVoucher).success).toBe(true);
  });

  it('rejects invalid dates, empty text, and bad ids', () => {
    expect(
      createVoucherSchema.safeParse({ ...validVoucher, voucher_date: '10/31/2026' })
        .success,
    ).toBe(false);
    expect(
      createVoucherSchema.safeParse({ ...validVoucher, payee: '   ' }).success,
    ).toBe(false);
    expect(
      createVoucherSchema.safeParse({
        ...validVoucher,
        items: [{ ...validVoucher.items[0], particulars: '' }],
      }).success,
    ).toBe(false);
    expect(
      createVoucherSchema.safeParse({ ...validVoucher, fund_id: 'main' }).success,
    ).toBe(false);
    expect(
      createVoucherSchema.safeParse({
        ...validVoucher,
        items: [{ ...validVoucher.items[0], category_id: '' }],
      }).success,
    ).toBe(false);
  });

  it('rejects zero, negative, and over-precise amounts', () => {
    for (const amount of ['0', '0.00', '-1', '10.001', '1,000']) {
      expect(
        createVoucherSchema.safeParse({
          ...validVoucher,
          items: [{ ...validVoucher.items[0], amount }],
        }).success,
        amount,
      ).toBe(false);
    }
  });

  it('accepts several lines but needs at least one and at most twenty', () => {
    const line = validVoucher.items[0];
    expect(
      createVoucherSchema.safeParse({ ...validVoucher, items: [line, line, line] }).success,
    ).toBe(true);
    expect(createVoucherSchema.safeParse({ ...validVoucher, items: [] }).success).toBe(false);
    expect(
      createVoucherSchema.safeParse({
        ...validVoucher,
        items: Array.from({ length: 21 }, () => line),
      }).success,
    ).toBe(false);
  });

  it('validates receipt paths and reason text', () => {
    const path = '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003/a.jpg';
    expect(
      receiptPathSchema.safeParse({ voucher_id: validVoucher.fund_id, receipt_path: path })
        .success,
    ).toBe(true);
    expect(
      receiptPathSchema.safeParse({
        voucher_id: validVoucher.fund_id,
        receipt_path: '../secrets/a.jpg',
      }).success,
    ).toBe(false);
    expect(
      receiptPathSchema.safeParse({
        voucher_id: validVoucher.fund_id,
        receipt_path: `${path}.pdf`,
      }).success,
    ).toBe(false);

    expect(
      voucherReasonSchema.parse({
        voucher_id: validVoucher.fund_id,
        reason: '  Receipt missing  ',
      }).reason,
    ).toBe('Receipt missing');
    expect(
      voucherReasonSchema.safeParse({
        voucher_id: validVoucher.fund_id,
        reason: '   ',
      }).success,
    ).toBe(false);
    expect(
      voucherReasonSchema.safeParse({
        voucher_id: validVoucher.fund_id,
        reason: 'x'.repeat(301),
      }).success,
    ).toBe(false);

    expect(
      noReceiptReasonSchema.safeParse({
        voucher_id: validVoucher.fund_id,
        reason: 'Small purchase',
      }).success,
    ).toBe(true);
    expect(
      noReceiptReasonSchema.safeParse({
        voucher_id: validVoucher.fund_id,
        reason: ' ',
      }).success,
    ).toBe(false);
  });

  it('knows the release-first statuses', () => {
    expect(isVoucherStatus('released')).toBe(true);
    expect(isVoucherStatus('rejected')).toBe(true);
    expect(isVoucherStatus('submitted')).toBe(true);
    expect(isVoucherStatus('nonsense')).toBe(false);
    expect(isVoucherStatus('approved')).toBe(true);
  });
});

describe('text sanitising', () => {
  it('strips control, invisible and bidi characters and angle brackets', () => {
    expect(cleanText('Ana\u0000 Cruz‮')).toBe('Ana Cruz');
    expect(cleanText('<script>alert(1)</script>Store')).toBe('scriptalert(1)/scriptStore');
    expect(cleanText('a​b⁦c')).toBe('abc');
    expect(cleanText('  too   many\n\tspaces ')).toBe('too many spaces');
    expect(cleanText('line1\r\n\r\n\r\n\r\nline2', true)).toBe('line1\n\nline2');
  });

  it('enforces length limits after cleaning and rejects oversized input', () => {
    const payee = text({ max: 10, min: 1 });
    expect(payee.safeParse('x'.repeat(11)).success).toBe(false);
    expect(payee.safeParse('x'.repeat(10)).success).toBe(true);
    expect(payee.safeParse('​​').success).toBe(false);
    expect(payee.safeParse('x'.repeat(1_000_000)).success).toBe(false);
  });

  it('restricts names and labels to sensible characters', () => {
    expect(personName().safeParse("Mary-Ann O'Neil Jr.").success).toBe(true);
    expect(personName().safeParse('Robert"); DROP TABLE').success).toBe(false);
    expect(labelText(60, 'x').safeParse('Office Supplies (A/B)').success).toBe(true);
    expect(labelText(60, 'x').safeParse('=cmd|calc').success).toBe(false);
  });
});
