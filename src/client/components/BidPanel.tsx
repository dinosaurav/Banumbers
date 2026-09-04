import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { formatBananas, isValidBid } from "../../shared/game";
import { MAX_BID, MIN_BID } from "../../shared/types";

interface Props {
  round: number;
  stash: number;
  crate: number;
  hasBid: boolean;
  lockedBid: number | null;
  onBid: (amount: number) => void;
}

const QUICK = [1, 5, 10, 25, 50, 100];

/** Don't pop the keyboard automatically on phones; it hides the table. */
const isTouchDevice = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export function BidPanel({ round, stash, crate, hasBid, lockedBid, onBid }: Props) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText("");
  }, [round]);

  const value = text === "" ? null : Number(text);
  const valid = value !== null && isValidBid(value);
  const canCover = stash + crate;

  const setValue = (n: number) => setText(String(Math.min(MAX_BID, Math.max(MIN_BID, Math.floor(n)))));
  const nudge = (fn: (v: number) => number) => setValue(fn(value ?? 0));

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid || value === null) return;
    onBid(value);
  };

  return (
    <motion.form
      className="card bid-panel stack"
      onSubmit={submit}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <div className="row between wrap">
        <div className="label" style={{ margin: 0 }}>
          {hasBid ? "Locked in — change your mind?" : "Secretly pick your number"}
        </div>
        <span className="hint">
          You can cover a tariff up to <b>{formatBananas(canCover)}</b> (stash {formatBananas(stash)} + crate{" "}
          {formatBananas(crate)})
        </span>
      </div>

      <div className="bid-input-row">
        <input
          className="bid-input"
          type="number"
          inputMode="numeric"
          min={MIN_BID}
          max={MAX_BID}
          step={1}
          placeholder="1 … bananillion"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
          aria-label="Your bid"
          autoFocus={!isTouchDevice()}
        />
        <motion.button
          type="submit"
          className={`btn ${hasBid ? "secondary" : ""}`}
          disabled={!valid}
          whileTap={{ scale: 0.95 }}
          animate={valid && !hasBid ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ repeat: valid && !hasBid ? Infinity : 0, duration: 1.2 }}
        >
          {hasBid ? "Update" : "Lock in 🍌"}
        </motion.button>
      </div>

      <div className="chips">
        {QUICK.map((q) => (
          <motion.button
            key={q}
            type="button"
            className="chip"
            onClick={() => setValue(q)}
            whileTap={{ scale: 0.9 }}
          >
            {q}
          </motion.button>
        ))}
        <motion.button type="button" className="chip" onClick={() => nudge((v) => v + 1)} whileTap={{ scale: 0.9 }}>
          +1
        </motion.button>
        <motion.button type="button" className="chip" onClick={() => nudge((v) => v + 10)} whileTap={{ scale: 0.9 }}>
          +10
        </motion.button>
        <motion.button type="button" className="chip" onClick={() => nudge((v) => v * 2)} whileTap={{ scale: 0.9 }}>
          ×2
        </motion.button>
        <motion.button
          type="button"
          className="chip"
          onClick={() => setValue(canCover + 1)}
          whileTap={{ scale: 0.9 }}
          title="Highest number you could ever bid where losing by 1 doesn't bust you"
        >
          safe-ish ({formatBananas(canCover + 1)})
        </motion.button>
        <motion.button
          type="button"
          className="chip"
          onClick={() => setValue(MAX_BID)}
          whileTap={{ scale: 0.9, rotate: -6 }}
          title="A bananillion"
        >
          🍌illion
        </motion.button>
      </div>

      {lockedBid !== null && (
        <span className="hint">
          Current bid: <b>{formatBananas(lockedBid)}</b>. Waiting for the others…
        </span>
      )}
    </motion.form>
  );
}
