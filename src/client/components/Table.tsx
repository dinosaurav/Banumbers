import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { formatBananas } from "../../shared/game";
import type { Phase, PublicPlayer } from "../../shared/types";
import type { Display } from "../playback";
import { AnimatedNumber } from "./Common";

// ---------------------------------------------------------------------------
// Crate
// ---------------------------------------------------------------------------

export function Crate({ count, refilling }: { count: number; refilling?: boolean }) {
  const shown = Math.min(count, 24);
  return (
    <motion.div
      id="anchor-crate"
      className="crate"
      animate={refilling ? { scale: [1, 1.1, 1], rotate: [0, -2, 2, 0] } : { scale: 1 }}
      transition={{ duration: 0.6 }}
    >
      <span className="crate-label">The crate</span>
      <span className="crate-count">
        <span className="emoji">🍌</span>
        <AnimatedNumber value={count} />
      </span>
      <div className="banana-pile" aria-hidden>
        <AnimatePresence initial={false}>
          {Array.from({ length: shown }, (_, i) => (
            <motion.span
              key={i}
              initial={{ scale: 0, y: -20 }}
              animate={{ scale: 1, y: 0, rotate: ((i * 47) % 60) - 30 }}
              exit={{ scale: 0, y: 10, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20, delay: i * 0.02 }}
            >
              🍌
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Seat
// ---------------------------------------------------------------------------

interface SeatProps {
  player: PublicPlayer;
  isMe: boolean;
  isHost: boolean;
  phase: Phase;
  stash: number;
  bid: number | null;
  revealed: boolean;
  spotlight: boolean;
  busted: boolean;
  bustNow: boolean;
  winner: boolean;
  myBid: number | null;
}

export function Seat(p: SeatProps) {
  const [shake, setShake] = useState(0);
  useEffect(() => {
    if (p.bustNow) setShake((s) => s + 1);
  }, [p.bustNow]);

  const classes = ["seat"];
  if (p.isMe) classes.push("me");
  if (!p.player.connected) classes.push("disconnected");
  if (p.spotlight) classes.push("spot");
  if (p.busted) classes.push("busted");
  if (p.winner) classes.push("winner-glow");

  return (
    <motion.div
      id={`anchor-${p.player.id}`}
      className={classes.join(" ")}
      layout
      key={shake}
      initial={false}
      animate={
        p.bustNow
          ? { x: [0, -10, 10, -8, 8, -4, 4, 0], rotate: [0, -2, 2, -1, 1, 0] }
          : p.spotlight
            ? { y: -4 }
            : { x: 0, y: 0 }
      }
      transition={p.bustNow ? { duration: 0.6 } : { type: "spring", stiffness: 300, damping: 24 }}
    >
      <div className="badges">
        {p.isHost && <span className="pill yellow">👑</span>}
        {p.phase === "bidding" &&
          (p.player.hasBid ? (
            <motion.span
              className="pill green"
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
            >
              ✅ locked in
            </motion.span>
          ) : (
            <span className="pill">🤔 thinking</span>
          ))}
        {!p.player.connected && <span className="pill red">away</span>}
      </div>

      <motion.span
        className="avatar"
        animate={p.spotlight ? { scale: [1, 1.2, 1], rotate: [0, -10, 10, 0] } : { scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        {p.player.avatar}
      </motion.span>
      <span className="name">
        {p.player.name}
        {p.isMe ? " (you)" : ""}
      </span>
      <span className="stash">
        <span className="emoji">🍌</span>
        <AnimatedNumber value={p.stash} />
      </span>

      {p.phase !== "lobby" &&
        (p.revealed && p.bid !== null ? (
          <motion.span
            className={`bid-tag ${p.spotlight ? "top" : ""}`}
            initial={{ rotateX: 90, opacity: 0, y: -6 }}
            animate={{ rotateX: 0, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            wrote {formatBananas(p.bid)}
          </motion.span>
        ) : p.phase === "bidding" && p.isMe && p.myBid !== null ? (
          <span className="bid-tag">your bid: {formatBananas(p.myBid)}</span>
        ) : p.phase === "bidding" ? (
          <span className="bid-tag hidden-bid">???</span>
        ) : null)}

      <AnimatePresence>
        {p.busted && (
          <motion.div
            className="stamp"
            initial={{ scale: 3, opacity: 0, rotate: -30 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
          >
            <span>BUST</span>
          </motion.div>
        )}
        {p.winner && !p.busted && (
          <motion.div
            className="stamp gold"
            initial={{ scale: 3, opacity: 0, rotate: 20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <span>🏆 winner</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface TableProps {
  players: PublicPlayer[];
  playerId: string;
  hostId: string | null;
  phase: Phase;
  display: Display | null;
  bids: Record<string, number> | null;
  myBid: number | null;
}

export function Table({ players, playerId, hostId, phase, display, bids, myBid }: TableProps) {
  const bustNowId = display?.beat?.kind === "bust" ? display.beat.playerId : null;
  const showWinners = display?.done && display.winnerIds.length > 0;
  return (
    <div className="table">
      {players.map((pl) => (
        <Seat
          key={pl.id}
          player={pl}
          isMe={pl.id === playerId}
          isHost={pl.id === hostId}
          phase={phase}
          stash={display ? (display.stashes[pl.id] ?? pl.stash) : pl.stash}
          bid={bids?.[pl.id] ?? null}
          revealed={display?.revealed.has(pl.id) ?? false}
          spotlight={display?.spotlight.has(pl.id) ?? false}
          busted={display?.busted.has(pl.id) ?? false}
          bustNow={bustNowId === pl.id}
          winner={(showWinners && display?.winnerIds.includes(pl.id)) ?? false}
          myBid={myBid}
        />
      ))}
    </div>
  );
}
