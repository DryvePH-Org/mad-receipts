import { describe, expect, it } from 'vitest';

import {
  formatPHP,
  isPositiveMoney,
  parseMoney,
  toMoneyNumber,
} from '@/lib/pcf/money';

describe('parseMoney', () => {
  it('converts decimal strings to exact centavos', () => {
    expect(parseMoney('0.01')).toBe(1);
    expect(parseMoney('10.5')).toBe(1050);
    expect(parseMoney('10000')).toBe(1_000_000);
    expect(parseMoney(' 10 ')).toBe(1_000);
    expect(parseMoney('9999999999.99')).toBe(999_999_999_999);
  });

  it('rejects malformed or out-of-range amounts', () => {
    for (const value of [
      '',
      '1.234',
      '-1',
      '1,000',
      '1e3',
      '0x10',
      '10000000000',
    ]) {
      expect(parseMoney(value), value).toBeNull();
    }
  });
});

describe('isPositiveMoney', () => {
  it('requires more than zero', () => {
    expect(isPositiveMoney('0')).toBe(false);
    expect(isPositiveMoney('0.00')).toBe(false);
    expect(isPositiveMoney('0.01')).toBe(true);
  });
});

describe('toMoneyNumber', () => {
  it('returns the decimal value for insert boundaries', () => {
    expect(toMoneyNumber('10000.00')).toBe(10000);
    expect(toMoneyNumber('0.25')).toBe(0.25);
  });

  it('throws for invalid input', () => {
    expect(() => toMoneyNumber('abc')).toThrow();
  });
});

describe('formatPHP', () => {
  it('formats pesos with grouping and centavos', () => {
    const formatted = formatPHP('10000');
    expect(formatted).toContain('10,000.00');
    expect(formatted).toContain('₱');
  });

  it('accepts numbers from the database', () => {
    expect(formatPHP(250.5)).toContain('250.50');
  });
});
