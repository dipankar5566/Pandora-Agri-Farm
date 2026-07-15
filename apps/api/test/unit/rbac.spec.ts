import { describe, expect, it } from 'vitest';
import { effectiveLevel, hasLevel } from '../../src/common/rbac';

describe('RBAC level aggregation', () => {
  const perms = [
    { module: 'health', level: 'view' as const },
    { module: 'health', level: 'edit' as const },   // second role grants more
    { module: 'finance', level: 'none' as const },
  ];

  it('takes the highest level across roles', () => {
    expect(effectiveLevel(perms, 'health')).toBe('edit');
  });

  it('defaults to none for unknown modules', () => {
    expect(effectiveLevel(perms, 'livestock')).toBe('none');
  });

  it('none never satisfies view', () => {
    expect(hasLevel(perms, 'finance', 'view')).toBe(false);
  });

  it('higher level satisfies lower requirement', () => {
    expect(hasLevel(perms, 'health', 'view')).toBe(true);
    expect(hasLevel(perms, 'health', 'edit')).toBe(true);
    expect(hasLevel(perms, 'health', 'approve')).toBe(false);
  });
});
