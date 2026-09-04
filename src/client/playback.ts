import { useEffect, useMemo, useRef, useState } from "react";
import { formatBananas } from "../shared/game";
import type { PublicPlayer, RoundResult } from "../shared/types";

/** One step of the reveal animation. `applyAt` = ms into the beat when its effect lands. */
export type Beat = (
  | { kind: "intro" }
  | { kind: "reveal_bid"; playerId: string; bid: number }
  | { kind: "spotlight"; playerIds: string[] }
  | { kind: "transfer"; from: string; to: Record<string, number>; spotlight: string[] }
  | { kind: "bust"; playerId: string }
  | { kind: "refill"; crate: number }
  | { kind: "end"; winnerIds: string[] }
) & { title: string; sub?: string; duration: number; applyAt: number };

export interface Display {
  stashes: Record<string, number>;
  crate: number;
  revealed: Set<string>;
  busted: Set<string>;
  spotlight: Set<string>;
  title: string;
  sub?: string;
  beat: Beat | null;
  beatIndex: number;
  done: boolean;
  winnerIds: string[];
}

const nameOf = (players: PublicPlayer[], id: string) => players.find((p) => p.id === id)?.name ?? "someone";
const namesOf = (players: PublicPlayer[], ids: string[]) => {
  const names = ids.map((id) => nameOf(players, id));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
};

export function buildBeats(result: RoundResult, players: PublicPlayer[]): Beat[] {
  const beats: Beat[] = [];
  const n = Object.keys(result.bids).length;
  const revealPace = n > 5 ? 500 : 700;

  beats.push({ kind: "intro", title: "Bids are in!", sub: "Revealing lowest to highest…", duration: 900, applyAt: 0 });

  const ascending = Object.entries(result.bids).sort((a, b) => a[1] - b[1]);
  for (const [playerId, bid] of ascending) {
    beats.push({
      kind: "reveal_bid",
      playerId,
      bid,
      title: `${nameOf(players, playerId)} wrote ${formatBananas(bid)}`,
      duration: revealPace,
      applyAt: 0,
    });
  }

  for (const step of result.steps) {
    if (step.kind === "win") {
      beats.push({
        kind: "spotlight",
        playerIds: [step.playerId],
        title: `${nameOf(players, step.playerId)} has the highest number!`,
        sub: `${formatBananas(step.bid)}`,
        duration: 1300,
        applyAt: 0,
      });
      beats.push({
        kind: "transfer",
        from: "crate",
        to: { [step.playerId]: step.crate },
        spotlight: [step.playerId],
        title: `Takes the crate: +${formatBananas(step.crate)} 🍌`,
        duration: 1500,
        applyAt: 950,
      });
      if (step.tariff > 0 && step.secondBid !== null) {
        const recipients = Object.keys(step.tariffShares);
        beats.push({
          kind: "transfer",
          from: step.playerId,
          to: step.tariffShares,
          spotlight: [step.playerId, ...recipients],
          title: `Tariff: ${formatBananas(step.bid)} − ${formatBananas(step.secondBid)} = ${formatBananas(step.tariff)} 🍌`,
          sub: `Paid to ${namesOf(players, recipients)}`,
          duration: 1900,
          applyAt: 1000,
        });
      } else {
        beats.push({
          kind: "spotlight",
          playerIds: [step.playerId],
          title: "Nobody below them — no tariff!",
          sub: "Lowest bidder keeps it all",
          duration: 1200,
          applyAt: 0,
        });
      }
    } else if (step.kind === "bust") {
      beats.push({
        kind: "spotlight",
        playerIds: [step.playerId],
        title: `${nameOf(players, step.playerId)} has the highest number…`,
        sub: `${formatBananas(step.bid)} — tariff would be ${formatBananas(step.tariff)}, but they only have ${formatBananas(step.had)}`,
        duration: 1800,
        applyAt: 0,
      });
      beats.push({
        kind: "bust",
        playerId: step.playerId,
        title: "🍌💥 BANANA BUST!",
        sub: `${nameOf(players, step.playerId)} drops to 0. The crate passes down…`,
        duration: 2200,
        applyAt: 500,
      });
    } else {
      beats.push({
        kind: "spotlight",
        playerIds: step.playerIds,
        title: `Tie at ${formatBananas(step.bid)}!`,
        sub: `${namesOf(players, step.playerIds)} split the crate, no tariff`,
        duration: 1300,
        applyAt: 0,
      });
      const to: Record<string, number> = {};
      for (const id of step.playerIds) to[id] = step.share;
      beats.push({
        kind: "transfer",
        from: "crate",
        to,
        spotlight: step.playerIds,
        title: `+${formatBananas(step.share)} 🍌 each`,
        duration: 1500,
        applyAt: 950,
      });
    }
  }

  beats.push({
    kind: "refill",
    crate: result.nextCrate,
    title: `Crate refills to ${formatBananas(result.nextCrate)} 🍌`,
    sub: "It always matches the richest stash",
    duration: 1400,
    applyAt: 300,
  });

  beats.push({
    kind: "end",
    winnerIds: result.winnerIds,
    title:
      result.winnerIds.length > 0
        ? `🏆 ${namesOf(players, result.winnerIds)} win${result.winnerIds.length > 1 ? "" : "s"} the game!`
        : `Round ${result.round} complete`,
    duration: 0,
    applyAt: 0,
  });

  return beats;
}

/** Fold beats [0..applied] over the starting state to compute what the table should show. */
export function computeDisplay(result: RoundResult, beats: Beat[], index: number, applied: number): Display {
  const stashes = { ...result.stashesBefore };
  let crate = result.crate;
  const revealed = new Set<string>();
  const busted = new Set<string>();

  for (let i = 0; i <= applied && i < beats.length; i++) {
    const b = beats[i]!;
    switch (b.kind) {
      case "reveal_bid":
        revealed.add(b.playerId);
        break;
      case "transfer": {
        let total = 0;
        for (const [id, amt] of Object.entries(b.to)) {
          stashes[id] = (stashes[id] ?? 0) + amt;
          total += amt;
        }
        if (b.from === "crate") crate = Math.max(0, crate - total);
        else stashes[b.from] = (stashes[b.from] ?? 0) - total;
        break;
      }
      case "bust":
        stashes[b.playerId] = 0;
        busted.add(b.playerId);
        break;
      case "refill":
        crate = b.crate;
        break;
    }
  }

  const beat = beats[Math.min(index, beats.length - 1)] ?? null;
  const spotlight = new Set<string>();
  if (beat?.kind === "spotlight") beat.playerIds.forEach((id) => spotlight.add(id));
  if (beat?.kind === "transfer") beat.spotlight.forEach((id) => spotlight.add(id));
  if (beat?.kind === "bust") spotlight.add(beat.playerId);
  if (beat?.kind === "reveal_bid") spotlight.add(beat.playerId);
  if (beat?.kind === "end") beat.winnerIds.forEach((id) => spotlight.add(id));

  const done = index >= beats.length - 1;
  return {
    stashes,
    crate,
    revealed,
    busted,
    spotlight,
    title: beat?.title ?? "",
    sub: beat?.sub,
    beat,
    beatIndex: index,
    done,
    winnerIds: result.winnerIds,
  };
}

/**
 * Drives the reveal animation for a round result. Re-runs whenever a new
 * result (by round number) arrives. `skip()` jumps to the end.
 */
export function usePlayback(result: RoundResult | null, players: PublicPlayer[]) {
  const beats = useMemo(() => (result ? buildBeats(result, players) : []), [result, players]);
  const [cursor, setCursor] = useState({ index: 0, applied: -1, round: result?.round ?? -1 });
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  // Reset when a new result comes in.
  useEffect(() => {
    clearTimers();
    setCursor({ index: 0, applied: -1, round: result?.round ?? -1 });
  }, [result?.round]);

  // Schedule the current beat's apply + advance.
  useEffect(() => {
    clearTimers();
    const beat = beats[cursor.index];
    if (!beat) return;
    if (beat.applyAt <= 0) {
      setCursor((c) => (c.applied < c.index ? { ...c, applied: c.index } : c));
    } else {
      timers.current.push(
        window.setTimeout(() => setCursor((c) => (c.applied < c.index ? { ...c, applied: c.index } : c)), beat.applyAt),
      );
    }
    if (beat.duration > 0 && cursor.index < beats.length - 1) {
      timers.current.push(
        window.setTimeout(
          () => setCursor((c) => ({ ...c, index: c.index + 1, applied: Math.max(c.applied, c.index) })),
          beat.duration,
        ),
      );
    }
    return clearTimers;
  }, [beats, cursor.index]);

  const skip = () => {
    clearTimers();
    setCursor((c) => ({ ...c, index: beats.length - 1, applied: beats.length - 1 }));
  };

  const display = useMemo(
    () => (result ? computeDisplay(result, beats, cursor.index, cursor.applied) : null),
    [result, beats, cursor.index, cursor.applied],
  );

  return { display, skip, beats };
}
