import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { ClientMessage, RoomState } from "../../shared/types";
import { usePlayback } from "../playback";
import { BidPanel } from "./BidPanel";
import { Finished } from "./Finished";
import { burstAt, FlightLayer } from "./Fx";
import { Crate, Table } from "./Table";
import { Timer } from "./Timer";

interface Props {
  room: RoomState;
  playerId: string;
  clockOffset: number;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
}

export function Game({ room, playerId, clockOffset, send, onLeave }: Props) {
  const me = room.players.find((p) => p.id === playerId);
  const host = room.players.find((p) => p.id === room.hostId);
  const canAct = room.hostId === playerId || !(host?.connected ?? false);

  // Players identity is stable across state pushes so the playback timeline doesn't rebuild.
  const playersKey = room.players.map((p) => `${p.id}:${p.name}:${p.avatar}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stablePlayers = useMemo(() => room.players, [playersKey]);

  const showingResult = room.phase === "reveal" || room.phase === "finished";
  const { display, skip } = usePlayback(showingResult ? room.lastResult : null, stablePlayers);

  // Remember the amount we locked in (server only tells us *that* we bid).
  const [myBid, setMyBid] = useState<number | null>(null);
  useEffect(() => setMyBid(null), [room.round, room.phase]);

  // Little celebration whenever bananas land on someone from the crate.
  useEffect(() => {
    const beat = display?.beat;
    if (beat?.kind === "transfer" && beat.from === "crate") {
      const t = window.setTimeout(() => Object.keys(beat.to).forEach((id) => burstAt(id)), beat.applyAt);
      return () => window.clearTimeout(t);
    }
  }, [display?.beatIndex, display?.beat]);

  const bidCount = room.players.filter((p) => p.hasBid).length;
  const waitingOnConnected = room.players.some((p) => !p.hasBid && p.connected);
  const canForceReveal = canAct && room.phase === "bidding" && !waitingOnConnected && bidCount < room.players.length;

  const done = display?.done ?? false;
  const crateShown = display ? display.crate : room.crate;

  return (
    <>
      <div className="game-header">
        <div className="row wrap">
          <span className="pill yellow">Round {room.round}</span>
          {room.phase === "bidding" && (
            <span className="pill">
              {bidCount}/{room.players.length} locked in
            </span>
          )}
          {room.phase === "bidding" && room.biddingEndsAt !== null && (
            <Timer endsAt={room.biddingEndsAt} totalSeconds={room.settings.bidSeconds} clockOffset={clockOffset} />
          )}
        </div>
        <Crate count={crateShown} refilling={display?.beat?.kind === "refill"} />
        <span className="pill target-pill">🏁 First to {room.settings.target.toLocaleString("en-US")}</span>
      </div>

      <div className="banner" aria-live="polite">
        <AnimatePresence mode="wait">
          {showingResult && display ? (
            <motion.div
              key={`${room.round}-${display.beatIndex}`}
              initial={{ y: 14, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              {display.title}
              {display.sub && <span className="sub">{display.sub}</span>}
            </motion.div>
          ) : room.phase === "bidding" ? (
            <motion.div key="bidding" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {me?.hasBid ? "Locked in. Sweating yet?" : "Pick a number. Highest wins the crate… minus the tariff."}
              <span className="sub">
                Tariff = your number − the second-highest number. Can't pay? You bust to zero.
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <Table
        players={room.players}
        playerId={playerId}
        hostId={room.hostId}
        phase={room.phase}
        display={showingResult ? display : null}
        bids={showingResult ? (room.lastResult?.bids ?? null) : null}
        myBid={myBid}
      />

      {room.phase === "bidding" && me && (
        <>
          <BidPanel
            round={room.round}
            stash={me.stash}
            crate={room.crate}
            hasBid={me.hasBid}
            lockedBid={myBid}
            onBid={(amount) => {
              setMyBid(amount);
              send({ type: "bid", amount });
            }}
          />
          {canForceReveal && (
            <div className="overlay-controls">
              <button className="btn small secondary" onClick={() => send({ type: "reveal_now" })}>
                ⏭️ Reveal now (skip absent players)
              </button>
            </div>
          )}
        </>
      )}

      {showingResult && (
        <div className="overlay-controls">
          {!done && (
            <button className="btn small ghost" onClick={skip}>
              Skip animation ⏩
            </button>
          )}
          {done && room.phase === "reveal" && (
            <>
              {canAct ? (
                <motion.button
                  className="btn big"
                  onClick={() => send({ type: "next_round" })}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.96 }}
                >
                  Next round ▶
                </motion.button>
              ) : (
                <span className="hint">Waiting for {host?.name ?? "the host"} to start the next round…</span>
              )}
            </>
          )}
        </div>
      )}

      {room.phase === "finished" && done && (
        <Finished room={room} playerId={playerId} canAct={canAct} send={send} onLeave={onLeave} />
      )}

      <FlightLayer beat={display?.beat ?? null} beatIndex={display?.beatIndex ?? -1} />
    </>
  );
}
