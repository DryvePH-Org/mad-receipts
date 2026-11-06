import { describe, expect, it } from 'vitest';

import {
  ACTION_ROLES,
  ALL_ROLES,
  ROLE_LABELS,
  canAccessRoute,
  canPerform,
  type Action,
  type Role,
} from '@/lib/pcf/permissions';
import { NAV_ITEMS, effectiveModules, effectivePcfRole, navGroups, roleModules } from '@/lib/navigation';

describe('canAccessRoute', () => {
  it.each<[Role, string, boolean]>([
    ['admin', '/pcf', true],
    ['admin', '/pcf/vouchers', true],
    ['admin', '/pcf/approvals', true],
    ['admin', '/pcf/replenishments', true],
    ['admin', '/pcf/cash-count', true],
    ['admin', '/pcf/reports', true],
    ['admin', '/pcf/audit', true],
    ['admin', '/pcf/notifications', true],
    ['admin', '/pcf/funds', true],
    ['admin', '/pcf/categories', true],
    ['custodian', '/pcf/vouchers', true],
    ['custodian', '/pcf/vouchers/new', true],
    ['custodian', '/pcf/cash-count', true],
    ['custodian', '/pcf/approvals', false],
    ['custodian', '/pcf/reports', false],
    ['custodian', '/pcf/audit', false],
    ['custodian', '/pcf/notifications', false],
    ['custodian', '/admin/users', false],
    ['admin', '/admin/users', false], // MAD's Users page, not a petty cash page
    ['approver', '/pcf/approvals', true],
    ['approver', '/pcf/vouchers', true],
    ['approver', '/pcf/vouchers/new', true],
    ['approver', '/pcf/replenishments', false],
    ['approver', '/pcf/funds', false],
    ['accounting', '/pcf/replenishments', true],
    ['accounting', '/pcf/reports', true],
    ['accounting', '/pcf/audit', true],
    ['accounting', '/pcf/vouchers', true],
    ['accounting', '/pcf/vouchers/new', false],
    ['accounting', '/pcf/cash-count', false],
    ['accounting', '/pcf/categories', false],
  ])('%s on %s → %s', (role, pathname, expected) => {
    expect(canAccessRoute(role, pathname)).toBe(expected);
  });

  it('matches nested routes but not sibling prefixes', () => {
    expect(canAccessRoute('custodian', '/pcf/vouchers/abc/receipt')).toBe(true);
    expect(canAccessRoute('approver', '/pcf/vouchers/abc/receipt')).toBe(true);
    expect(canAccessRoute('custodian', '/pcf/vouchers-archive')).toBe(false);
  });

  it('keeps voucher creation restricted while the list stays readable', () => {
    for (const role of ['admin', 'custodian', 'approver'] as const) {
      expect(canAccessRoute(role, '/pcf/vouchers/new')).toBe(true);
    }
    expect(canAccessRoute('accounting', '/pcf/vouchers/new')).toBe(false);
  });

  it('denies unknown routes to every role', () => {
    for (const role of ALL_ROLES) {
      expect(canAccessRoute(role, '/login')).toBe(false);
      expect(canAccessRoute(role, '/unknown')).toBe(false);
      expect(canAccessRoute(role, '/')).toBe(false);
    }
  });

  it('lets every role reach the dashboard', () => {
    for (const role of ALL_ROLES) {
      expect(canAccessRoute(role, '/pcf')).toBe(true);
    }
  });
});

describe('canPerform', () => {
  it('separates duties between custodian, approver, and accounting', () => {
    const custodianActions: Action[] = [
      'voucher.create',
      'voucher.submit',
      'voucher.release',
      'voucher.void',
      'replenishment.create',
      'replenishment.submit',
      'cash.count',
    ];
    for (const action of custodianActions) {
      expect(canPerform('custodian', action)).toBe(true);
    }

    expect(canPerform('approver', 'voucher.approve')).toBe(true);
    expect(canPerform('approver', 'voucher.reject')).toBe(true);
    // Approvers can prepare their own vouchers but hold no fund or cash duties.
    for (const action of ['voucher.create', 'voucher.submit', 'voucher.release', 'voucher.void'] as const) {
      expect(canPerform('approver', action)).toBe(true);
    }
    for (const action of ['replenishment.create', 'replenishment.submit', 'cash.count'] as const) {
      expect(canPerform('approver', action)).toBe(false);
    }
    expect(canPerform('accounting', 'voucher.create')).toBe(false);

    expect(canPerform('accounting', 'replenishment.review')).toBe(true);
    expect(canPerform('accounting', 'replenishment.close')).toBe(true);
    expect(canPerform('accounting', 'replenishment.create')).toBe(false);
    expect(canPerform('accounting', 'voucher.approve')).toBe(false);
  });

  it('grants admin every action', () => {
    for (const action of Object.keys(ACTION_ROLES) as Action[]) {
      expect(canPerform('admin', action)).toBe(true);
    }
  });

  it('never grants an action to a role outside its map', () => {
    for (const [action, roles] of Object.entries(ACTION_ROLES)) {
      for (const role of ALL_ROLES) {
        expect(canPerform(role, action as Action)).toBe(
          roles.includes(role),
        );
      }
    }
  });
});

describe('ROLE_LABELS', () => {
  it('labels every role', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});

describe('navigation', () => {
  const pcfItems = NAV_ITEMS.filter((item) => item.id.startsWith('pcf'));

  it('only shows a petty cash page to roles that can open it', () => {
    for (const role of ALL_ROLES) {
      for (const item of pcfItems) {
        expect(item.pcfRoles?.includes(role), `${role} ${item.href}`).toBe(canAccessRoute(role, item.href));
      }
    }
  });

  it('gives petty cash only to people with a petty cash role (an Admin has one by default)', () => {
    expect(effectivePcfRole('sales', null)).toBeNull();
    expect(effectivePcfRole('approver', null)).toBeNull();
    expect(effectivePcfRole('admin', null)).toBe('admin');
    expect(effectivePcfRole('admin', 'custodian')).toBe('custodian');
    expect(effectivePcfRole('sales', 'accounting')).toBe('accounting');
    expect(effectivePcfRole('sales', 'custodian', false)).toBeNull();
    expect(effectivePcfRole('sales', 'nonsense')).toBeNull();
    expect(roleModules('sales')).not.toContain('pcf');
    expect(roleModules('sales', 'custodian')).toEqual(expect.arrayContaining(['pcf', 'pcf-vouchers', 'pcf-cash-count', 'pcf-replenishments']));
    expect(roleModules('sales', 'custodian')).not.toContain('pcf-approvals');
  });

  it('lets an Admin hide a petty cash page from one person, but not grant one without the role', () => {
    expect(effectiveModules('sales', [], ['pcf-cash-count'], 'custodian')).not.toContain('pcf-cash-count');
    expect(effectiveModules('sales', ['pcf-approvals'], [], 'custodian')).not.toContain('pcf-approvals');
    expect(effectiveModules('sales', ['pcf'], [], null)).not.toContain('pcf');
  });

  it('puts petty cash in its own sidebar group', () => {
    const groups = navGroups('sales', effectiveModules('sales', [], [], 'accounting'));
    expect(groups.map((group) => group.label)).toEqual(['Invoice', 'PCF']);
    expect(groups[1].items.map((item) => item.href)).toEqual(['/pcf', '/pcf/vouchers', '/pcf/replenishments', '/pcf/reports', '/pcf/audit']);
  });
});
