import { MAX_BID, MIN_BID, type RoundResult, type RoundStep, type Settings } from "./types";

export interface RoundEntry {
  id: string;
  seat: number;
  stash: number;
  bid: number;
}

export function isValidBid(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_BID &&
    value <= MAX_BID
  );
}

/**
 * Split `total` as evenly as possible across `ids`, handing leftover
 * bananas one at a time to the earliest seats.
 */
function splitEvenly(total: number, ids: string[]): Record<string, number> {
  const shares: Record<string, number> = {};
  const base = Math.floor(total / ids.length);
  let remainder = total - base * ids.length;
  for (const id of ids) {
    shares[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  return shares;
}

/**
 * Resolve one round of Banumbers.
 *
 * Rules:
 *  - Highest bid wins the crate but pays a tariff of (their bid - next highest bid)
 *    to the next-highest bidder(s).
 *  - If stash + crate can't cover the tariff, the bidder busts: their stash drops
 *    to 0 and the next-highest bidder gets the same check against the bidder
 *    below them, and so on.
 *  - If the current-highest position is a tie, the tied players split the crate
 *    and nobody pays a tariff.
 *  - The lowest bidder has nobody below them, so their tariff is 0.
 */
export function resolveRound(
  round: number,
  entries: RoundEntry[],
  crate: number,
  settings: Settings,
): RoundResult {
  const stashesBefore: Record<string, number> = {};
  const stashes: Record<string, number> = {};
  const bids: Record<string, number> = {};
  for (const e of entries) {
    stashesBefore[e.id] = e.stash;
    stashes[e.id] = e.stash;
    bids[e.id] = e.bid;
  }

  // Group by bid, highest first; within a group order by seat for determinism.
  const byBid = new Map<number, RoundEntry[]>();
  for (const e of entries) {
    const list = byBid.get(e.bid) ?? [];
    list.push(e);
    byBid.set(e.bid, list);
  }
  const groups = [...byBid.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([bid, list]) => ({
      bid,
      ids: list.sort((a, b) => a.seat - b.seat).map((e) => e.id),
    }));

  const steps: RoundStep[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;
    const next = groups[i + 1] ?? null;

    if (group.ids.length > 1) {
      const share = Math.floor(crate / group.ids.length);
      for (const id of group.ids) stashes[id]! += share;
      steps.push({ kind: "tie", playerIds: group.ids, bid: group.bid, crate, share });
      break;
    }

    const winner = group.ids[0]!;
    const tariff = next ? group.bid - next.bid : 0;
    const had = stashes[winner]! + crate;

    if (had >= tariff) {
      stashes[winner] = had - tariff;
      const tariffShares = next && tariff > 0 ? splitEvenly(tariff, next.ids) : {};
      for (const [id, amount] of Object.entries(tariffShares)) stashes[id]! += amount;
      steps.push({
        kind: "win",
        playerId: winner,
        bid: group.bid,
        crate,
        secondBid: next?.bid ?? null,
        tariff,
        tariffShares,
      });
      break;
    }

    // Bust: bananas vanish into the hyperinflationary void.
    steps.push({
      kind: "bust",
      playerId: winner,
      bid: group.bid,
      secondBid: next!.bid,
      tariff,
      had,
      lost: stashes[winner]!,
    });
    stashes[winner] = 0;
  }

  const nextCrate = computeNextCrate(stashes, settings);
  const winnerIds = computeWinners(stashes, settings.target);

  return {
    round,
    crate,
    bids,
    steps,
    stashesBefore,
    stashesAfter: stashes,
    nextCrate,
    winnerIds,
  };
}

/** The crate refills to match the richest stash. */
export function computeNextCrate(stashes: Record<string, number>, settings: Settings): number {
  const max = Math.max(0, ...Object.values(stashes));
  // Degenerate case: everyone is broke. Re-seed so the game can continue.
  return max > 0 ? max : settings.startingCrate;
}

/** Players at or above the target; if several, the richest win (co-winners on exact tie). */
export function computeWinners(stashes: Record<string, number>, target: number): string[] {
  const qualified = Object.entries(stashes).filter(([, s]) => s >= target);
  if (qualified.length === 0) return [];
  const top = Math.max(...qualified.map(([, s]) => s));
  return qualified.filter(([, s]) => s === top).map(([id]) => id);
}

export function formatBananas(n: number): string {
  return n.toLocaleString("en-US");
}
