import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AVATARS } from "../../shared/avatars";
import type { Profile } from "../identity";

// ---------------------------------------------------------------------------
// Background bananas
// ---------------------------------------------------------------------------

export function BgBananas({ count = 14 }: { count?: number }) {
  const bananas = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 37 + 11) % 100,
        duration: 22 + ((i * 7) % 16),
        delay: -((i * 5) % 30),
        size: 22 + ((i * 13) % 26),
      })),
    [count],
  );
  return (
    <div className="bg-bananas" aria-hidden>
      {bananas.map((b, i) => (
        <span
          key={i}
          className="bg-banana"
          style={{
            left: `${b.left}%`,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
            fontSize: b.size,
          }}
        >
          🍌
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

export function Toast({ notice }: { notice: { id: number; message: string } | null }) {
  const [visible, setVisible] = useState<{ id: number; message: string } | null>(null);
  useEffect(() => {
    if (!notice) return;
    setVisible(notice);
    const t = window.setTimeout(() => setVisible(null), 3500);
    return () => window.clearTimeout(t);
  }, [notice]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={visible.id}
          className="toast error"
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          role="status"
        >
          {visible.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="card modal"
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function RulesContent() {
  return (
    <>
      <h2>How to play 🍌</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        A game about numbers, guts, and the hyperinflationary macroeconomics of bananas.
      </p>
      <ol>
        <li>
          Everyone starts with <b>10 bananas</b> in their stash, and there are <b>10 bananas in the crate</b>.
        </li>
        <li>
          Each round, everyone secretly picks a number from <b>1 to a bananillion</b>.
        </li>
        <li>
          The <b>highest number wins the whole crate</b>… but pays a <b>tariff</b> equal to{" "}
          <i>their number minus the second-highest number</i>, paid to that second-highest player.
        </li>
        <li>
          If the winner can't cover the tariff (stash + crate), they <b>banana bust</b>: their stash drops to
          0 and the crate passes to the next-highest player, who runs the same check against the player below
          them. And so on.
        </li>
        <li>
          If players <b>tie</b> for the top spot, they split the crate and nobody pays a tariff.
        </li>
        <li>
          After each round the crate refills to match the <b>richest stash</b> at the table.
        </li>
        <li>
          <b>First to 200 bananas wins.</b>
        </li>
      </ol>
      <div className="example">
        <b>Example:</b> I write 30, you write 25. I take the crate (10) → I have 20, then pay you a 5-banana
        tariff. We're both at 15. Great deal.
        <br />
        <br />
        <b>Example 2:</b> I write 90, you write 10, they write 8. My tariff would be 80 — I only have 20. I bust
        to 0. You now take the crate (→ 20) and pay a tariff of 2 to them: you're at 18, they're at 12. The
        crate refills to 18.
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        House rules: a tied tariff recipient group splits the tariff; leftover bananas from uneven splits are
        lost to inflation; players who don't bid in time automatically bid 1; if everyone hits 0 the crate
        resets to its starting size.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Profile editor
// ---------------------------------------------------------------------------

export function ProfileEditor({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
}) {
  return (
    <div className="stack">
      <div>
        <div className="label">Your name</div>
        <input
          className="input"
          value={profile.name}
          maxLength={16}
          placeholder="Banana Joe"
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
        />
      </div>
      <div>
        <div className="label">Pick a monkey</div>
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <motion.button
              key={a}
              type="button"
              className={`avatar-btn ${profile.avatar === a ? "selected" : ""}`}
              onClick={() => onChange({ ...profile, avatar: a })}
              whileTap={{ scale: 0.9, rotate: -8 }}
              aria-label={`avatar ${a}`}
              aria-pressed={profile.avatar === a}
            >
              {a}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Animated number
// ---------------------------------------------------------------------------

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const from = display;
    const to = value;
    if (from === to) return;
    const duration = Math.min(900, 250 + Math.abs(to - from) * 12);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <motion.span
      key={value}
      className={className}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.25, 1] }}
      transition={{ duration: 0.4 }}
    >
      {display.toLocaleString("en-US")}
    </motion.span>
  );
}
