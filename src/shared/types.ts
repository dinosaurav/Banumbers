export type Phase = "lobby" | "bidding" | "reveal" | "finished";

export interface Settings {
  /** Bananas needed to win. */
  target: number;
  /** Bananas each player starts with. */
  startingStash: number;
  /** Bananas in the crate on round 1. */
  startingCrate: number;
  /** Seconds allowed per bidding round. 0 disables the timer. */
  bidSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = {
  target: 200,
  startingStash: 10,
  startingCrate: 10,
  bidSeconds: 45,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MIN_BID = 1;
/** "A bananillion." */
export const MAX_BID = 1_000_000_000;

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  seat: number;
  stash: number;
  connected: boolean;
  /** Whether this player has locked in a bid this round (amount stays secret). */
  hasBid: boolean;
  /** Lifetime stats for this room. */
  wins: number;
  busts: number;
}

export type RoundStep =
  | {
      kind: "win";
      playerId: string;
      bid: number;
      crate: number;
      /** Bid of the next-highest group (null if nobody is below). */
      secondBid: number | null;
      tariff: number;
      /** How much of the tariff went to each recipient. */
      tariffShares: Record<string, number>;
    }
  | {
      kind: "bust";
      playerId: string;
      bid: number;
      secondBid: number;
      tariff: number;
      /** stash + crate they could have used. */
      had: number;
      /** bananas that vanished from their stash. */
      lost: number;
    }
  | {
      kind: "tie";
      playerIds: string[];
      bid: number;
      crate: number;
      /** each tied player receives this many. */
      share: number;
    };

export interface RoundResult {
  round: number;
  crate: number;
  /** Every player's bid, revealed. */
  bids: Record<string, number>;
  steps: RoundStep[];
  stashesBefore: Record<string, number>;
  stashesAfter: Record<string, number>;
  nextCrate: number;
  /** Non-empty if someone reached the target this round. */
  winnerIds: string[];
}

export interface RoomState {
  code: string;
  phase: Phase;
  settings: Settings;
  hostId: string | null;
  players: PublicPlayer[];
  round: number;
  crate: number;
  /** Epoch ms at which bidding auto-resolves; null when no timer. */
  biddingEndsAt: number | null;
  /** Result of the most recent round (shown during "reveal"). */
  lastResult: RoundResult | null;
  /** Compact history, one row per round. */
  history: RoundResult[];
  winnerIds: string[];
  /** How many games have been completed in this room. */
  gamesPlayed: number;
}

// ---- Client -> Server ----
export type ClientMessage =
  | { type: "join"; token: string; name: string; avatar: string }
  | { type: "update_profile"; name: string; avatar: string }
  | { type: "set_settings"; settings: Partial<Settings> }
  | { type: "start" }
  | { type: "bid"; amount: number }
  | { type: "reveal_now" }
  | { type: "next_round" }
  | { type: "play_again" }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "ping" };

// ---- Server -> Client ----
export type ServerMessage =
  | { type: "welcome"; playerId: string; state: RoomState; serverNow: number }
  | { type: "state"; state: RoomState; serverNow: number }
  | { type: "kicked" }
  /** `fatal` errors mean the client should stop reconnecting (room full, game in progress, ...). */
  | { type: "error"; message: string; fatal?: boolean }
  | { type: "pong"; serverNow: number };
