import { describe, expect, it } from 'vitest';

import { buildScanPrompt, parseScan, snapPayee } from '@/lib/pcf/receipt-ai';

const categories = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Office Supplies' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Meals' },
];

describe('parseScan', () => {
  it('maps items, categories and header fields', () => {
    const out = parseScan(
      JSON.stringify({
        payee: ' National Bookstore ',
        date: '2026-10-30',
        items: [
          { description: 'Bond paper', amount: 250, category: 'office supplies' },
          { description: 'Coffee', amount: '85.5', category: 'Meals' },
          { description: 'Mystery', amount: 10, category: 'Nope' },
        ],
        total: 345.5,
      }),
      categories,
    );
    expect(out).toEqual({
      warnings: [],
      payee: 'National Bookstore',
      voucher_date: '2026-10-30',
      lines: [
        { particulars: 'Bond paper', amount: '250.00', category_id: categories[0].id },
        { particulars: 'Coffee', amount: '85.50', category_id: categories[1].id },
        { particulars: 'Mystery', amount: '10.00', category_id: '' },
      ],
    });
  });

  it('copes with think blocks, prose and thousands separators', () => {
    const out = parseScan(
      '<think>hmm {not json}</think>Here you go: {"payee":"ACME","date":null,"items":[{"description":"Toner","amount":"1,250.00","category":null}],"total":null}',
      categories,
    );
    expect(out?.lines[0].amount).toBe('1250.00');
    expect(out?.voucher_date).toBe('');
  });

  it('falls back to the total when no items are readable', () => {
    const out = parseScan('{"payee":"Shell","date":"2026-11-01","items":[],"total":900}', categories);
    expect(out?.lines).toEqual([{ particulars: 'Shell', amount: '900.00', category_id: '' }]);
  });

  it('drops bad amounts and bad dates, and returns null for junk', () => {
    const out = parseScan(
      '{"payee":"X","date":"yesterday","items":[{"description":"A","amount":-5},{"description":"B","amount":0}],"total":null}',
      categories,
    );
    expect(out?.lines).toEqual([]);
    expect(out?.voucher_date).toBe('');
    expect(parseScan('sorry, cannot read', categories)).toBeNull();
    expect(parseScan('{"items":[]}', categories)).toBeNull();
  });
});

describe('snapPayee', () => {
  const known = ['Camila Leanda', 'Mang Tonyo Hardware'];
  it('snaps a close misreading to a known payee', () => {
    expect(snapPayee('CAMILA LERONDA', known)).toBe('Camila Leanda');
    expect(snapPayee('mang tonio hardware', known)).toBe('Mang Tonyo Hardware');
  });
  it('keeps unknown names, tidying ALL CAPS', () => {
    expect(snapPayee('JUAN DELA CRUZ', known)).toBe('Juan Dela Cruz');
    expect(snapPayee('Juan dela Cruz', known)).toBe('Juan dela Cruz');
  });
});

describe('parseScan warnings', () => {
  it('warns when the lines do not add up to the written total', () => {
    const out = parseScan(
      '{"payee":"X","date":null,"items":[{"description":"A","amount":100},{"description":"B","amount":50}],"total":200}',
      categories,
    );
    expect(out?.warnings[0]).toMatch(/150\.00.*200\.00/);
    const ok = parseScan(
      '{"payee":"X","date":null,"items":[{"description":"A","amount":100}],"total":100}',
      categories,
    );
    expect(ok?.warnings).toEqual([]);
  });
  it('snaps the payee using known names', () => {
    const out = parseScan(
      '{"payee":"CAMILA LERONDA","date":null,"items":[{"description":"A","amount":5}],"total":null}',
      categories,
      ['Camila Leanda'],
    );
    expect(out?.payee).toBe('Camila Leanda');
  });
});

describe('buildScanPrompt', () => {
  it('lists the categories and today', () => {
    const prompt = buildScanPrompt(['Meals', 'Fuel'], '2026-11-02');
    expect(prompt).toContain('"Meals", "Fuel"');
    expect(prompt).toContain('2026-11-02');
  });

  it('asks for every table row when reading a paper voucher', () => {
    const prompt = buildScanPrompt(['Meals'], '2026-11-02', 'voucher');
    expect(prompt).toContain('paper petty cash voucher');
    expect(prompt).toContain('EVERY row');
    expect(buildScanPrompt(['Meals'], '2026-11-02')).toContain('store receipt');
  });
});
