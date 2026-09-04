import { motion } from "motion/react";
import { useState } from "react";
import { getProfile, saveProfile, type Profile } from "../identity";
import { roomPath } from "../router";
import { Modal, ProfileEditor, RulesContent } from "./Common";

const TITLE = "BANUMBERS";

export function Home({ navigate }: { navigate: (path: string) => void }) {
  const [profile, setProfile] = useState<Profile>(() => getProfile());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const updateProfile = (p: Profile) => {
    setProfile(p);
    saveProfile(p);
  };

  const createRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error("Server said no");
      const data = (await res.json()) as { code: string };
      navigate(roomPath(data.code));
    } catch {
      setError("Couldn't create a room. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(clean)) {
      setError("Room codes are 4 letters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${clean}`);
      if (res.status === 404) {
        setError("No room with that code. Check the letters?");
        return;
      }
      navigate(roomPath(clean));
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content">
      <div className="hero">
        <h1 aria-label={TITLE}>
          {TITLE.split("").map((ch, i) => (
            <motion.span
              key={i}
              className="letter"
              initial={{ y: -60, opacity: 0, rotate: -15 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ delay: 0.05 * i, type: "spring", stiffness: 300, damping: 14 }}
              whileHover={{ y: -8, rotate: i % 2 ? 6 : -6, transition: { duration: 0.15 } }}
            >
              {ch}
            </motion.span>
          ))}
        </h1>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          A game about numbers, guts, and the hyperinflationary macroeconomics of bananas. 🍌
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          style={{ marginTop: 10 }}
        >
          <button className="btn ghost" onClick={() => setRulesOpen(true)}>
            📜 How to play
          </button>
        </motion.div>
      </div>

      <motion.div
        className="home-grid"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, type: "spring", stiffness: 200, damping: 22 }}
      >
        <div className="card">
          <ProfileEditor profile={profile} onChange={updateProfile} />
        </div>

        <div className="card stack" style={{ justifyContent: "space-between" }}>
          <div className="stack">
            <div className="label">Start a new game</div>
            <motion.button
              className="btn big"
              onClick={createRoom}
              disabled={busy}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              🍌 Create a room
            </motion.button>
          </div>
          <div className="divider" />
          <form className="stack" onSubmit={joinRoom}>
            <div className="label">Or join a friend</div>
            <input
              className="input code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 4))}
              placeholder="CODE"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label="Room code"
            />
            <button className="btn secondary" type="submit" disabled={busy || code.length < 4}>
              Join room →
            </button>
          </form>
          {error && (
            <motion.div className="pill red" initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
              {error}
            </motion.div>
          )}
        </div>
      </motion.div>

      <div className="footer-note">2–8 players · works great on phones · pass the link, not the bananas</div>

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
