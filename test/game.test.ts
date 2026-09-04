import { describe, expect, it } from "vitest";
import { computeNextCrate, computeWinners, isValidBid, resolveRound } from "../src/shared/game";
import { DEFAULT_SETTINGS, MAX_BID } from "../src/shared/types";

const S = DEFAULT_SETTINGS;
const p = (id: string, seat: number, stash: number, bid: number) => ({ id, seat, stash, bid });

describe("resolveRound", () => {
  it("reel example: 30 vs 25 -> winner takes crate, pays 5", () => {
    const r = resolveRound(1, [p("me", 0, 10, 30), p("you", 1, 10, 25)], 10, S);
    expect(r.steps).toEqual([
      {
        kind: "win",
        playerId: "me",
        bid: 30,
        crate: 10,
        secondBid: 25,
        tariff: 5,
        tariffShares: { you: 5 },
      },
    ]);
    expect(r.stashesAfter).toEqual({ me: 15, you: 15 });
    expect(r.nextCrate).toBe(15);
    expect(r.winnerIds).toEqual([]);
  });

  it("reel example: 90 busts, 10 wins crate and pays 2 to 8", () => {
    const r = resolveRound(
      1,
      [p("me", 0, 10, 90), p("you", 1, 10, 10), p("them", 2, 10, 8)],
      10,
      S,
    );
    expect(r.steps.map((s) => s.kind)).toEqual(["bust", "win"]);
    expect(r.steps[0]).toMatchObject({ playerId: "me", tariff: 80, had: 20, lost: 10 });
    expect(r.steps[1]).toMatchObject({ playerId: "you", tariff: 2, tariffShares: { them: 2 } });
    expect(r.stashesAfter).toEqual({ me: 0, you: 18, them: 12 });
    expect(r.nextCrate).toBe(18);
  });

  it("tie for highest splits the crate with no tariff", () => {
    const r = resolveRound(1, [p("a", 0, 10, 50), p("b", 1, 10, 50), p("c", 2, 10, 3)], 10, S);
    expect(r.steps).toEqual([{ kind: "tie", playerIds: ["a", "b"], bid: 50, crate: 10, share: 5 }]);
    expect(r.stashesAfter).toEqual({ a: 15, b: 15, c: 10 });
  });

  it("tie after a bust splits the crate", () => {
    const r = resolveRound(1, [p("a", 0, 10, 999), p("b", 1, 10, 7), p("c", 2, 10, 7)], 11, S);
    expect(r.steps.map((s) => s.kind)).toEqual(["bust", "tie"]);
    // 11 split 2 ways -> 5 each, 1 banana lost to the void
    expect(r.stashesAfter).toEqual({ a: 0, b: 15, c: 15 });
  });

  it("tariff to a tied second place is split, remainder to earliest seat", () => {
    const r = resolveRound(1, [p("a", 0, 10, 20), p("b", 1, 10, 15), p("c", 2, 10, 15)], 10, S);
    expect(r.steps[0]).toMatchObject({ kind: "win", tariff: 5, tariffShares: { b: 3, c: 2 } });
    expect(r.stashesAfter).toEqual({ a: 15, b: 13, c: 12 });
  });

  it("everyone busts down to the lowest bidder, who pays nothing", () => {
    const r = resolveRound(1, [p("a", 0, 0, 1000), p("b", 1, 0, 500), p("c", 2, 0, 1)], 10, S);
    expect(r.steps.map((s) => s.kind)).toEqual(["bust", "bust", "win"]);
    expect(r.steps[2]).toMatchObject({ playerId: "c", tariff: 0, secondBid: null, tariffShares: {} });
    expect(r.stashesAfter).toEqual({ a: 0, b: 0, c: 10 });
  });

  it("exactly affording the tariff is not a bust", () => {
    const r = resolveRound(1, [p("a", 0, 10, 30), p("b", 1, 10, 10)], 10, S);
    expect(r.steps[0]).toMatchObject({ kind: "win", tariff: 20 });
    expect(r.stashesAfter).toEqual({ a: 0, b: 30 });
  });

  it("detects the game winner at the target", () => {
    const r = resolveRound(9, [p("a", 0, 150, 60), p("b", 1, 100, 55)], 150, S);
    expect(r.stashesAfter).toEqual({ a: 295, b: 105 });
    expect(r.winnerIds).toEqual(["a"]);
  });

  it("two players over the target: richest wins, exact tie -> co-winners", () => {
    expect(computeWinners({ a: 210, b: 205, c: 5 }, 200)).toEqual(["a"]);
    expect(computeWinners({ a: 210, b: 210, c: 5 }, 200)).toEqual(["a", "b"]);
    expect(computeWinners({ a: 199, b: 5 }, 200)).toEqual([]);
  });

  it("crate re-seeds when everyone is broke", () => {
    expect(computeNextCrate({ a: 0, b: 0 }, S)).toBe(S.startingCrate);
    expect(computeNextCrate({ a: 3, b: 7 }, S)).toBe(7);
  });
});

describe("isValidBid", () => {
  it("accepts integers from 1 to a bananillion", () => {
    expect(isValidBid(1)).toBe(true);
    expect(isValidBid(MAX_BID)).toBe(true);
    expect(isValidBid(0)).toBe(false);
    expect(isValidBid(MAX_BID + 1)).toBe(false);
    expect(isValidBid(2.5)).toBe(false);
    expect(isValidBid("7")).toBe(false);
    expect(isValidBid(NaN)).toBe(false);
  });
});
