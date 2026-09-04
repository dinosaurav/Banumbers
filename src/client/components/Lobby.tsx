import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, type ClientMessage, type RoomState, type Settings } from "../../shared/types";
import { getProfile, saveProfile, type Profile } from "../identity";
import { Modal, ProfileEditor } from "./Common";

interface Props {
  room: RoomState;
  playerId: string;
  send: (msg: ClientMessage) => void;
}

const TARGETS = [50, 100, 150, 200, 300, 500];
const STASHES = [5, 10, 20, 50];
const CRATES = [5, 10, 20, 50];
const TIMERS: [number, string][] = [
  [0, "No timer"],
  [15, "15 seconds"],
  [30, "30 seconds"],
  [45, "45 seconds"],
  [60, "60 seconds"],
  [120, "2 minutes"],
];

export function Lobby({ room, playerId, send }: Props) {
  const me = room.players.find((p) => p.id === playerId);
  const host = room.players.find((p) => p.id === room.hostId);
  const hostConnected = host?.connected ?? false;
  const isHost = room.hostId === playerId;
  const canAct = isHost || !hostConnected;
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<Profile>(() => getProfile());

  const shareUrl = `${location.origin}/room/${room.code}`;

  const copy = async () => {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Banumbers", text: `Join my Banumbers room: ${room.code}`, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // user cancelled share
    }
  };

  const update = (patch: Partial<Settings>) => send({ type: "set_settings", settings: patch });

  const saveEdit = () => {
    saveProfile(profile);
    send({ type: "update_profile", name: profile.name, avatar: profile.avatar });
    setEditing(false);
  };

  const emptySeats = Math.max(0, MAX_PLAYERS - room.players.length);

  return (
    <>
      <motion.div className="card center" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="label">Room code</div>
        <motion.div
          className="room-code"
          initial={{ letterSpacing: "0.6em", opacity: 0 }}
          animate={{ letterSpacing: "0.25em", opacity: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 16 }}
        >
          {room.code}
        </motion.div>
        <div className="row" style={{ justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn small" onClick={copy}>
            {copied ? "✅ Copied!" : "🔗 Copy invite link"}
          </button>
          <span className="hint">{shareUrl.replace(/^https?:\/\//, "")}</span>
        </div>
      </motion.div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <div className="label" style={{ margin: 0 }}>
            Players ({room.players.length}/{MAX_PLAYERS})
          </div>
          <button className="btn ghost" onClick={() => setEditing(true)}>
            ✏️ Edit my monkey
          </button>
        </div>
        <div className="player-list">
          <AnimatePresence initial={false}>
            {room.players.map((p) => (
              <motion.div
                key={p.id}
                className="player-row"
                layout
                initial={{ scale: 0.6, opacity: 0, rotate: -6 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                style={{ opacity: p.connected ? 1 : 0.55 }}
              >
                <motion.span
                  className="avatar"
                  animate={{ rotate: [0, -8, 8, 0] }}
                  transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 + p.seat }}
                >
                  {p.avatar}
                </motion.span>
                <span className="name">
                  {p.name}
                  {p.id === playerId && <span className="muted"> (you)</span>}
                </span>
                {p.id === room.hostId && <span className="pill yellow">👑 host</span>}
                {!p.connected && <span className="pill red">away</span>}
                {canAct && p.id !== playerId && (
                  <button className="btn ghost" title="Kick" onClick={() => send({ type: "kick", playerId: p.id })}>
                    ✕
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {Array.from({ length: Math.min(emptySeats, 3) }, (_, i) => (
            <div key={`empty-${i}`} className="player-row empty">
              waiting for a monkey…
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <div className="label" style={{ margin: 0 }}>
            Game settings
          </div>
          {!canAct && <span className="hint">Only the host can change these</span>}
        </div>
        <div className="settings-grid">
          <label className="setting">
            <span className="label">🏁 First to</span>
            <select
              value={room.settings.target}
              disabled={!canAct}
              onChange={(e) => update({ target: Number(e.target.value) })}
            >
              {TARGETS.map((t) => (
                <option key={t} value={t}>
                  {t} bananas
                </option>
              ))}
            </select>
          </label>
          <label className="setting">
            <span className="label">🎒 Starting stash</span>
            <select
              value={room.settings.startingStash}
              disabled={!canAct}
              onChange={(e) => update({ startingStash: Number(e.target.value) })}
            >
              {STASHES.map((t) => (
                <option key={t} value={t}>
                  {t} bananas
                </option>
              ))}
            </select>
          </label>
          <label className="setting">
            <span className="label">📦 Starting crate</span>
            <select
              value={room.settings.startingCrate}
              disabled={!canAct}
              onChange={(e) => update({ startingCrate: Number(e.target.value) })}
            >
              {CRATES.map((t) => (
                <option key={t} value={t}>
                  {t} bananas
                </option>
              ))}
            </select>
          </label>
          <label className="setting">
            <span className="label">⏱️ Bid timer</span>
            <select
              value={room.settings.bidSeconds}
              disabled={!canAct}
              onChange={(e) => update({ bidSeconds: Number(e.target.value) })}
            >
              {TIMERS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card soft center stack" style={{ alignItems: "center" }}>
        {canAct ? (
          <>
            <motion.button
              className="btn big green"
              disabled={room.players.length < MIN_PLAYERS}
              onClick={() => send({ type: "start" })}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              animate={room.players.length >= MIN_PLAYERS ? { y: [0, -4, 0] } : {}}
              transition={{ repeat: Infinity, duration: 1.4 }}
            >
              🚀 Start the game
            </motion.button>
            {room.players.length < MIN_PLAYERS && (
              <span className="hint">You need at least {MIN_PLAYERS} players. Share the code!</span>
            )}
            {!isHost && <span className="hint">The host is away, so you can run the show.</span>}
          </>
        ) : (
          <>
            <motion.div
              style={{ fontSize: 40 }}
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              {me?.avatar ?? "🐵"}
            </motion.div>
            <div>
              Waiting for <b>{host?.name ?? "the host"}</b> to start…
            </div>
          </>
        )}
        {room.gamesPlayed > 0 && <span className="hint">Games played in this room: {room.gamesPlayed}</span>}
      </div>

      <Modal open={editing} onClose={() => setEditing(false)}>
        <h2>Edit your monkey</h2>
        <ProfileEditor profile={profile} onChange={setProfile} />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn small secondary" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button className="btn small" onClick={saveEdit}>
            Save
          </button>
        </div>
      </Modal>
    </>
  );
}
