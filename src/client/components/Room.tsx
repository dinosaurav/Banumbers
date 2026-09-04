import { motion } from "motion/react";
import { useState } from "react";
import { useRoom } from "../useRoom";
import { Modal, RulesContent, Toast } from "./Common";
import { Game } from "./Game";
import { Lobby } from "./Lobby";

interface Props {
  code: string;
  navigate: (path: string) => void;
}

export function Room({ code, navigate }: Props) {
  const conn = useRoom(code);
  const [rulesOpen, setRulesOpen] = useState(false);

  const goHome = () => navigate("/");
  const leave = () => {
    conn.leave();
    goHome();
  };

  const statusDot =
    conn.status === "open" ? "" : conn.status === "reconnecting" || conn.status === "connecting" ? "warn" : "off";

  return (
    <div className="content">
      <div className="topbar">
        <a className="brand" href="/" onClick={(e) => (e.preventDefault(), leave())}>
          <motion.span className="logo" animate={{ rotate: [0, 12, -12, 0] }} transition={{ repeat: Infinity, duration: 4 }}>
            🍌
          </motion.span>
          Banumbers
        </a>
        <div className="row wrap">
          <span className="pill" title={`Connection: ${conn.status}`}>
            <span className={`status-dot ${statusDot}`} /> {code}
          </span>
          <button className="btn ghost" onClick={() => setRulesOpen(true)}>
            📜 Rules
          </button>
          <button className="btn ghost" onClick={leave}>
            Leave
          </button>
        </div>
      </div>

      {conn.fatalError ? (
        <motion.div className="card center stack" initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
          <div style={{ fontSize: 56 }}>🙈</div>
          <h2 style={{ margin: 0 }}>Can't join this room</h2>
          <p className="muted" style={{ margin: 0 }}>
            {conn.fatalError}
          </p>
          <div>
            <button className="btn" onClick={goHome}>
              ← Back home
            </button>
          </div>
        </motion.div>
      ) : !conn.room || !conn.playerId ? (
        <div className="card center stack" style={{ alignItems: "center" }}>
          <motion.div
            style={{ fontSize: 56 }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
          >
            🍌
          </motion.div>
          <div className="muted">
            {conn.status === "reconnecting" ? "Reconnecting to the banana stand…" : `Joining room ${code}…`}
          </div>
        </div>
      ) : conn.room.phase === "lobby" ? (
        <Lobby room={conn.room} playerId={conn.playerId} send={conn.send} />
      ) : (
        <Game room={conn.room} playerId={conn.playerId} clockOffset={conn.clockOffset} send={conn.send} onLeave={leave} />
      )}

      {conn.status === "reconnecting" && conn.room && (
        <motion.div className="toast" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          📡 Reconnecting…
        </motion.div>
      )}

      <Toast notice={conn.notice} />

      <Modal open={rulesOpen} onClose={() => setRulesOpen(false)}>
        <RulesContent />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn small" onClick={() => setRulesOpen(false)}>
            Got it
          </button>
        </div>
      </Modal>
    </div>
  );
}
