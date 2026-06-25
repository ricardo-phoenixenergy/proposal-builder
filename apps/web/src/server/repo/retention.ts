/** Default number of versions kept per proposal before older snapshots are pruned (4c). */
const DEFAULT_VERSION_CAP = 20;

/**
 * Max immutable versions retained per proposal. `snapshotVersion` prunes beyond
 * this so `proposal_versions` can't grow unbounded (snapshots run on every export).
 * Overridable via PROPOSAL_VERSION_CAP; a non-positive/invalid value falls back.
 */
export function versionCap(): number {
  const n = Number(process.env.PROPOSAL_VERSION_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_VERSION_CAP;
}
