import { motion } from "motion/react";
import { useEffect } from "react";
import { formatBananas } from "../../shared/game";
import type { ClientMessage, RoomState } from "../../shared/types";
import { victoryConfetti } from "./Fx";

interface Props {
  room: RoomState;
  playerId: string;
  canAct: boolean;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
}

export function Finished({ room, playerId, canAct, send, onLeave }: Props) {
  useEffect(() => {
    victoryConfetti();
  }, []);

  const ranked = [...room.players].sort((a, b) => b.stash - a.stash);
  const winners = room.winnerIds;
  const iWon = winners.includes(playerId);
  const podium = ranked.slice(0, 3);
  const order = podium.length === 3 ? [podium[1]!, podium[0]!, podium[2]!] : podium;
  const heights = { first: 120, second: 84, third: 60 } as const;
  const rankClass = (id: string) => {
    const i = podium.findIndex((p) => p.id === id);
    return (["first", "second", "third"] as const)[i] ?? "third";
  };

  return (
    <motion.div className="card stack" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
      <motion.h2
        className="center"
        style={{ margin: 0, fontSize: "clamp(28px, 6vw, 44px)" }}
        initial={{ y: -20 }}
        animate={{ y: 0 }}
      >
        {iWon ? "🏆 You are banana rich!" : "🏆 Game over!"}
      </motion.h2>
      <p className="center muted" style={{ margin: 0 }}>
        {winners.length > 1
          ? `${winners.map((id) => room.players.find((p) => p.id === id)?.name ?? "?").join(" & ")} share the win`
          : `${room.players.find((p) => p.id === winners[0])?.name ?? "Someone"} reached ${formatBananas(
              room.settings.target,
            )} bananas in ${room.round} round${room.round === 1 ? "" : "s"}`}
      </p>

      <div className="podium">
        {order.map((p, i) => {
          const rank = rankClass(p.id);
          return (
            <motion.div
              key={p.id}
              className={`podium-slot ${rank}`}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 * i + (rank === "first" ? 0.3 : 0), type: "spring", stiffness: 220, damping: 18 }}
            >
              <motion.span
                className="avatar"
                animate={rank === "first" ? { y: [0, -10, 0], rotate: [0, -8, 8, 0] } : {}}
                transition={{ repeat: Infinity, duration: 1.4 }}
              >
                {p.avatar}
              </motion.span>
              <span style={{ fontWeight: 700 }}>{p.name}</span>
              <span className="pill yellow">🍌 {formatBananas(p.stash)}</span>
              <div className="block" style={{ height: heights[rank] }}>
                {rank === "first" ? "1st" : rank === "second" ? "2nd" : "3rd"}
              </div>
            </motion.div>
          );
        })}
      </div>

      {ranked.length > 3 && (
        <div className="row wrap" style={{ justifyContent: "center" }}>
          {ranked.slice(3).map((p, i) => (
            <span key={p.id} className="pill">
              {i + 4}. {p.avatar} {p.name} · 🍌 {formatBananas(p.stash)}
            </span>
          ))}
        </div>
      )}

      <div className="divider" />
      <div className="label">Round by round</div>
      <div style={{ overflowX: "auto" }}>
        <table className="history">
          <thead>
            <tr>
              <th>#</th>
              <th>Crate</th>
              {room.players.map((p) => (
                <th key={p.id}>
                  {p.avatar} {p.name}
                </th>
              ))}
              <th>What happened</th>
            </tr>
          </thead>
          <tbody>
            {room.history.map((r) => (
              <tr key={r.round}>
                <td>{r.round}</td>
                <td>{formatBananas(r.crate)}</td>
                {room.players.map((p) => (
                  <td key={p.id}>
                    <b>{r.bids[p.id] !== undefined ? formatBananas(r.bids[p.id]!) : "–"}</b>
                    <span className="muted"> → {formatBananas(r.stashesAfter[p.id] ?? 0)}</span>
                  </td>
                ))}
                <td>
                  {r.steps
                    .map((s) => {
                      const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? "?";
                      if (s.kind === "bust") return `${name(s.playerId)} busted`;
                      if (s.kind === "tie") return `${s.playerIds.map(name).join(" & ")} tied`;
                      return `${name(s.playerId)} won, tariff ${formatBananas(s.tariff)}`;
                    })
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overlay-controls" style={{ marginTop: 8 }}>
        {canAct ? (
          <motion.button className="btn big" onClick={() => send({ type: "play_again" })} whileTap={{ scale: 0.96 }}>
            🔁 Back to lobby
          </motion.button>
        ) : (
          <span className="hint">Waiting for the host to start another game…</span>
        )}
        <button className="btn secondary" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </motion.div>
  );
}
