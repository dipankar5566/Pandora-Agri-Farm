import { PERM_ORDER } from '@pandora/contracts';

export type PermLevel = keyof typeof PERM_ORDER;

/** A user's effective level for a module = highest level across their roles. */
export function effectiveLevel(
  perms: Array<{ module: string; level: PermLevel }>,
  module: string,
): PermLevel {
  let best: PermLevel = 'none';
  for (const p of perms) {
    if (p.module === module && PERM_ORDER[p.level] > PERM_ORDER[best]) best = p.level;
  }
  return best;
}

export function hasLevel(
  perms: Array<{ module: string; level: PermLevel }>,
  module: string,
  required: PermLevel,
): boolean {
  return PERM_ORDER[effectiveLevel(perms, module)] >= PERM_ORDER[required];
}
