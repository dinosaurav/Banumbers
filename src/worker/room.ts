import { DurableObject } from "cloudflare:workers";
import { isValidBid, resolveRound, type RoundEntry } from "../shared/game";
import { sanitizeAvatar, sanitizeName } from "../shared/avatars";
import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_BID,
  MIN_PLAYERS,
  type ClientMessage,
  type PublicPlayer,
  type RoomState,
  type RoundResult,
  type ServerMessage,
  type Settings,
} from "../shared/types";

interface InternalPlayer extends Omit<PublicPlayer, "connected" | "hasBid"> {
  token: string;
  bid: number | null;
}

interface InternalState {
  code: string;
  phase: RoomState["phase"];
  settings: Settings;
  hostId: string | null;
  players: InternalPlayer[];
  round: number;
  crate: number;
  biddingEndsAt: number | null;
  lastResult: RoundResult | null;
  history: RoundResult[];
  winnerIds: string[];
  gamesPlayed: number;
  /** Epoch ms since the room had zero connections; null while anyone is connected. */
  emptySince: number | null;
}

interface Attachment {
  token: string | null;
  playerId: string | null;
}

export interface RoomInfo {
  exists: boolean;
  phase: RoomState["phase"] | null;
  playerCount: number;
  maxPlayers: number;
}

const STATE_KEY = "state";
/** Delete an abandoned room after this long with nobody connected. */
const CLEANUP_AFTER_MS = 6 * 60 * 60 * 1000;
const MAX_HISTORY = 500;
const MAX_MESSAGE_BYTES = 4096;

const SETTINGS_LIMITS = {
  target: { min: 20, max: 100_000 },
  startingStash: { min: 0, max: 10_000 },
  startingCrate: { min: 1, max: 10_000 },
  bidSeconds: { min: 0, max: 600 },
} as const;

export class GameRoom extends DurableObject<Env> {
  private state: InternalState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<InternalState>(STATE_KEY)) ?? null;
    });
  }

  // ---------------------------------------------------------------------------
  // RPC (called from the Worker)
  // ---------------------------------------------------------------------------

  async getInfo(): Promise<RoomInfo> {
    if (!this.state) return { exists: false, phase: null, playerCount: 0, maxPlayers: MAX_PLAYERS };
    return {
      exists: true,
      phase: this.state.phase,
      playerCount: this.state.players.length,
      maxPlayers: MAX_PLAYERS,
    };
  }

  /** Create the room if it does not exist yet. Returns false if the code is taken. */
  async create(code: string): Promise<boolean> {
    if (this.state) return false;
    this.state = {
      code,
      phase: "lobby",
      settings: { ...DEFAULT_SETTINGS },
      hostId: null,
      players: [],
      round: 0,
      crate: DEFAULT_SETTINGS.startingCrate,
      biddingEndsAt: null,
      lastResult: null,
      history: [],
      winnerIds: [],
      gamesPlayed: 0,
      emptySince: Date.now(),
    };
    await this.persist();
    await this.scheduleAlarm();
    return true;
  }

  // ---------------------------------------------------------------------------
  // WebSocket lifecycle (Hibernation API)
  // ---------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    if (!this.state) {
      return new Response("Room not found", { status: 404 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ token: null, playerId: null } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    if (!this.state) {
      this.send(ws, { type: "error", fatal: true, message: "This room no longer exists." });
      ws.close(1008, "room gone");
      return;
    }
    try {
      await this.handle(ws, msg);
    } catch (err) {
      console.error(JSON.stringify({ event: "handle_error", error: String(err), type: msg.type }));
      this.send(ws, { type: "error", message: "Something went wrong on the server." });
    }
  }

  async webSocketClose(): Promise<void> {
    // The runtime auto-replies to Close frames (web_socket_auto_reply_to_close);
    // echoing `ws.close(code)` here would throw on reserved codes like 1006.
    await this.afterSocketGone();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      // already closed
    }
    await this.afterSocketGone();
  }

  private async afterSocketGone(): Promise<void> {
    if (!this.state) return;
    if (this.liveSockets().length === 0) {
      this.state.emptySince = Date.now();
      await this.persist();
    }
    await this.scheduleAlarm();
    this.broadcast();
  }

  // ---------------------------------------------------------------------------
  // Alarm: bidding timeout + abandoned-room cleanup
  // ---------------------------------------------------------------------------

  async alarm(): Promise<void> {
    if (!this.state) return;
    const now = Date.now();

    if (this.state.phase === "bidding" && this.state.biddingEndsAt !== null && now >= this.state.biddingEndsAt - 250) {
      await this.resolveCurrentRound();
    }

    if (
      this.liveSockets().length === 0 &&
      this.state.emptySince !== null &&
      now - this.state.emptySince >= CLEANUP_AFTER_MS
    ) {
      console.log(JSON.stringify({ event: "room_cleanup", code: this.state.code }));
      await this.ctx.storage.deleteAll();
      this.state = null;
      return;
    }

    await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    if (!this.state) return;
    const candidates: number[] = [];
    if (this.state.phase === "bidding" && this.state.biddingEndsAt !== null) {
      candidates.push(this.state.biddingEndsAt);
    }
    if (this.state.emptySince !== null && this.liveSockets().length === 0) {
      candidates.push(this.state.emptySince + CLEANUP_AFTER_MS);
    }
    if (candidates.length === 0) {
      await this.ctx.storage.deleteAlarm();
    } else {
      await this.ctx.storage.setAlarm(Math.min(...candidates));
    }
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  private async handle(ws: WebSocket, msg: ClientMessage): Promise<void> {
    const st = this.state!;
    const att = this.attachment(ws);

    if (msg.type === "ping") {
      this.send(ws, { type: "pong", serverNow: Date.now() });
      return;
    }

    if (msg.type === "join") {
      await this.handleJoin(ws, msg);
      return;
    }

    const player = att.playerId ? st.players.find((p) => p.id === att.playerId) : undefined;
    if (!player) {
      this.send(ws, { type: "error", message: "Join the room first." });
      return;
    }

    switch (msg.type) {
      case "update_profile": {
        const name = sanitizeName(msg.name);
        if (name) player.name = name;
        player.avatar = sanitizeAvatar(msg.avatar);
        break;
      }
      case "set_settings": {
        if (!this.isActingHost(player.id)) return this.deny(ws, "Only the host can change settings.");
        if (st.phase !== "lobby") return this.deny(ws, "Settings can only change in the lobby.");
        st.settings = this.mergeSettings(st.settings, msg.settings);
        st.crate = st.settings.startingCrate;
        break;
      }
      case "start": {
        if (!this.isActingHost(player.id)) return this.deny(ws, "Only the host can start the game.");
        if (st.phase !== "lobby") return this.deny(ws, "The game already started.");
        if (st.players.length < MIN_PLAYERS) return this.deny(ws, `Need at least ${MIN_PLAYERS} players.`);
        this.startGame();
        break;
      }
      case "bid": {
        if (st.phase !== "bidding") return this.deny(ws, "Bidding is closed.");
        if (!isValidBid(msg.amount)) return this.deny(ws, "Bids must be a whole number from 1 to a bananillion.");
        player.bid = msg.amount;
        if (st.players.every((p) => p.bid !== null)) {
          await this.resolveCurrentRound();
          return;
        }
        break;
      }
      case "reveal_now": {
        if (!this.isActingHost(player.id)) return this.deny(ws, "Only the host can force a reveal.");
        if (st.phase !== "bidding") return this.deny(ws, "Nothing to reveal.");
        const connected = this.connectedTokens();
        const waitingOnConnected = st.players.some((p) => p.bid === null && connected.has(p.token));
        if (waitingOnConnected) return this.deny(ws, "Connected players are still deciding.");
        await this.resolveCurrentRound();
        return;
      }
      case "next_round": {
        if (!this.isActingHost(player.id)) return this.deny(ws, "Only the host can continue.");
        if (st.phase !== "reveal") return this.deny(ws, "Not in the reveal phase.");
        this.beginRound(st.round + 1);
        break;
      }
      case "play_again": {
        if (!this.isActingHost(player.id)) return this.deny(ws, "Only the host can restart.");
        if (st.phase !== "finished") return this.deny(ws, "The game is still going.");
        st.phase = "lobby";
        st.round = 0;
        st.crate = st.settings.startingCrate;
        st.biddingEndsAt = null;
        st.lastResult = null;
        st.history = [];
        st.winnerIds = [];
        for (const p of st.players) {
          p.bid = null;
          p.stash = st.settings.startingStash;
        }
        break;
      }
      case "kick": {
        if (!this.isActingHost(player.id)) return this.deny(ws, "Only the host can kick.");
        if (st.phase !== "lobby") return this.deny(ws, "You can only kick in the lobby.");
        const target = st.players.find((p) => p.id === msg.playerId);
        if (!target || target.id === player.id) return;
        for (const sock of this.socketsFor(target.token)) {
          this.send(sock, { type: "kicked" });
          sock.close(1000, "kicked");
        }
        await this.removePlayer(target.id);
        return;
      }
      case "leave": {
        await this.removePlayer(player.id);
        ws.close(1000, "left");
        return;
      }
    }

    await this.persist();
    await this.scheduleAlarm();
    this.broadcast();
  }

  private async handleJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: "join" }>): Promise<void> {
    const st = this.state!;
    const token = typeof msg.token === "string" ? msg.token.slice(0, 64) : "";
    if (token.length < 8) return this.deny(ws, "Invalid session token.");

    let player = st.players.find((p) => p.token === token);
    const name = sanitizeName(msg.name) || `Monkey ${st.players.length + 1}`;
    const avatar = sanitizeAvatar(msg.avatar);

    if (!player) {
      if (st.phase !== "lobby") {
        this.send(ws, { type: "error", fatal: true, message: "This game is already in progress. Wait for the next one!" });
        return;
      }
      if (st.players.length >= MAX_PLAYERS) {
        this.send(ws, { type: "error", fatal: true, message: `This room is full (${MAX_PLAYERS} players).` });
        return;
      }
      const usedSeats = new Set(st.players.map((p) => p.seat));
      let seat = 0;
      while (usedSeats.has(seat)) seat++;
      player = {
        id: shortId(),
        token,
        name,
        avatar,
        seat,
        stash: st.settings.startingStash,
        bid: null,
        wins: 0,
        busts: 0,
      };
      st.players.push(player);
      st.players.sort((a, b) => a.seat - b.seat);
      if (!st.hostId) st.hostId = player.id;
    } else {
      player.name = name;
      player.avatar = avatar;
      // A second tab for the same player replaces the first.
      for (const other of this.socketsFor(token)) {
        if (other !== ws) other.close(1000, "replaced by a newer connection");
      }
    }

    ws.serializeAttachment({ token, playerId: player.id } satisfies Attachment);
    st.emptySince = null;
    await this.persist();
    await this.scheduleAlarm();

    this.send(ws, { type: "welcome", playerId: player.id, state: this.publicState(), serverNow: Date.now() });
    this.broadcast(ws);
  }

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------

  private startGame(): void {
    const st = this.state!;
    for (const p of st.players) {
      p.stash = st.settings.startingStash;
      p.bid = null;
    }
    st.crate = st.settings.startingCrate;
    st.history = [];
    st.lastResult = null;
    st.winnerIds = [];
    this.beginRound(1);
  }

  private beginRound(round: number): void {
    const st = this.state!;
    st.phase = "bidding";
    st.round = round;
    for (const p of st.players) p.bid = null;
    st.biddingEndsAt = st.settings.bidSeconds > 0 ? Date.now() + st.settings.bidSeconds * 1000 : null;
  }

  private async resolveCurrentRound(): Promise<void> {
    const st = this.state!;
    if (st.phase !== "bidding") return;

    const entries: RoundEntry[] = st.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      stash: p.stash,
      // Anyone who didn't decide in time bids the minimum.
      bid: p.bid ?? MIN_BID,
    }));
    for (const p of st.players) if (p.bid === null) p.bid = MIN_BID;

    const result = resolveRound(st.round, entries, st.crate, st.settings);

    for (const p of st.players) p.stash = result.stashesAfter[p.id] ?? p.stash;
    for (const step of result.steps) {
      if (step.kind === "bust") {
        const p = st.players.find((x) => x.id === step.playerId);
        if (p) p.busts++;
      }
    }

    st.lastResult = result;
    st.history.push(result);
    if (st.history.length > MAX_HISTORY) st.history.shift();
    st.crate = result.nextCrate;
    st.biddingEndsAt = null;

    if (result.winnerIds.length > 0) {
      st.phase = "finished";
      st.winnerIds = result.winnerIds;
      st.gamesPlayed++;
      for (const id of result.winnerIds) {
        const p = st.players.find((x) => x.id === id);
        if (p) p.wins++;
      }
    } else {
      st.phase = "reveal";
    }

    console.log(
      JSON.stringify({
        event: "round_resolved",
        code: st.code,
        round: result.round,
        steps: result.steps.map((s) => s.kind),
        finished: st.phase === "finished",
      }),
    );

    await this.persist();
    await this.scheduleAlarm();
    this.broadcast();
  }

  private async removePlayer(playerId: string): Promise<void> {
    const st = this.state!;
    st.players = st.players.filter((p) => p.id !== playerId);

    if (st.hostId === playerId) {
      const connected = this.connectedTokens();
      const next = st.players.find((p) => connected.has(p.token)) ?? st.players[0];
      st.hostId = next?.id ?? null;
    }

    if ((st.phase === "bidding" || st.phase === "reveal") && st.players.length < MIN_PLAYERS) {
      // Not enough people to keep playing: last one standing wins.
      st.phase = "finished";
      st.winnerIds = st.players.map((p) => p.id);
      st.biddingEndsAt = null;
      st.gamesPlayed++;
    } else if (st.phase === "bidding" && st.players.length > 0 && st.players.every((p) => p.bid !== null)) {
      await this.resolveCurrentRound();
      return;
    }

    await this.persist();
    await this.scheduleAlarm();
    this.broadcast();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
    const next = { ...current };
    for (const key of Object.keys(SETTINGS_LIMITS) as (keyof Settings)[]) {
      const value = patch[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const { min, max } = SETTINGS_LIMITS[key];
      next[key] = Math.min(max, Math.max(min, Math.round(value)));
    }
    return next;
  }

  /** The host, or anyone if the host is currently disconnected. */
  private isActingHost(playerId: string): boolean {
    const st = this.state!;
    if (st.hostId === playerId) return true;
    const host = st.players.find((p) => p.id === st.hostId);
    if (!host) return true;
    return !this.connectedTokens().has(host.token);
  }

  private liveSockets(): WebSocket[] {
    return this.ctx.getWebSockets();
  }

  private attachment(ws: WebSocket): Attachment {
    return (ws.deserializeAttachment() as Attachment | null) ?? { token: null, playerId: null };
  }

  private socketsFor(token: string): WebSocket[] {
    return this.liveSockets().filter((ws) => this.attachment(ws).token === token);
  }

  private connectedTokens(): Set<string> {
    const set = new Set<string>();
    for (const ws of this.liveSockets()) {
      const t = this.attachment(ws).token;
      if (t) set.add(t);
    }
    return set;
  }

  private publicState(): RoomState {
    const st = this.state!;
    const connected = this.connectedTokens();
    return {
      code: st.code,
      phase: st.phase,
      settings: st.settings,
      hostId: st.hostId,
      players: st.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        seat: p.seat,
        stash: p.stash,
        connected: connected.has(p.token),
        hasBid: p.bid !== null,
        wins: p.wins,
        busts: p.busts,
      })),
      round: st.round,
      crate: st.crate,
      biddingEndsAt: st.biddingEndsAt,
      lastResult: st.lastResult,
      history: st.history,
      winnerIds: st.winnerIds,
      gamesPlayed: st.gamesPlayed,
    };
  }

  private broadcast(except?: WebSocket): void {
    if (!this.state) return;
    const payload = JSON.stringify({
      type: "state",
      state: this.publicState(),
      serverNow: Date.now(),
    } satisfies ServerMessage);
    for (const ws of this.liveSockets()) {
      if (ws === except) continue;
      if (!this.attachment(ws).playerId) continue;
      try {
        ws.send(payload);
      } catch {
        // Socket is closing; webSocketClose will tidy up.
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }

  private deny(ws: WebSocket, message: string): void {
    this.send(ws, { type: "error", message });
  }

  private async persist(): Promise<void> {
    if (this.state) await this.ctx.storage.put(STATE_KEY, this.state);
  }
}

function shortId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
