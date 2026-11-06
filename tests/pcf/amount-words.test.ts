import { describe, expect, it } from 'vitest';

import { amountInWords } from '@/lib/pcf/amount-words';

describe('amountInWords', () => {
  it('spells whole and fractional pesos', () => {
    expect(amountInWords('1')).toBe('One peso only');
    expect(amountInWords('475.5')).toBe('Four hundred seventy-five pesos and 50/100 only');
    expect(amountInWords('1250')).toBe('One thousand two hundred fifty pesos only');
    expect(amountInWords('3000.05')).toBe('Three thousand pesos and 05/100 only');
    expect(amountInWords('21000')).toBe('Twenty-one thousand pesos only');
    expect(amountInWords('0')).toBe('Zero pesos only');
  });
});
