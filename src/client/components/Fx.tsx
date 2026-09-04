import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Beat } from "../playback";

interface Flight {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  delay: number;
  duration: number;
  emoji: string;
}

const anchorCenter = (id: string): { x: number; y: number } | null => {
  const el = document.getElementById(`anchor-${id}`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

let bananaShape: confetti.Shape | null = null;
function getBananaShape(): confetti.Shape | null {
  if (bananaShape) return bananaShape;
  try {
    bananaShape = confetti.shapeFromText({ text: "🍌", scalar: 3 });
  } catch {
    bananaShape = null;
  }
  return bananaShape;
}

export function burstAt(id: string, big = false): void {
  const c = anchorCenter(id);
  const origin = c ? { x: c.x / window.innerWidth, y: c.y / window.innerHeight } : { x: 0.5, y: 0.5 };
  const shape = getBananaShape();
  void confetti({
    particleCount: big ? 90 : 18,
    spread: big ? 100 : 80,
    startVelocity: big ? 45 : 32,
    scalar: big ? 2.2 : 1.1,
    ticks: big ? 220 : 90,
    gravity: 1.4,
    origin,
    shapes: shape ? [shape, "circle"] : ["circle"],
    colors: ["#ffe135", "#ffd000", "#fff3a8", "#4a2c17"],
    disableForReducedMotion: true,
  });
}

export function victoryConfetti(): void {
  const shape = getBananaShape();
  const end = Date.now() + 2400;
  const frame = () => {
    void confetti({
      particleCount: 6,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
      shapes: shape ? [shape, "circle"] : ["circle"],
      scalar: 2,
      colors: ["#ffe135", "#ffd000", "#4a2c17", "#ffffff"],
      disableForReducedMotion: true,
    });
    void confetti({
      particleCount: 6,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
      shapes: shape ? [shape, "circle"] : ["circle"],
      scalar: 2,
      colors: ["#ffe135", "#ffd000", "#4a2c17", "#ffffff"],
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

/**
 * Renders bananas flying between anchors whenever a transfer/bust beat starts.
 */
export function FlightLayer({ beat, beatIndex }: { beat: Beat | null; beatIndex: number }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(0);
  const removalTimers = useRef(new Set<number>());

  useEffect(() => {
    if (!beat) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const spawned: Flight[] = [];

    if (beat.kind === "transfer") {
      const from = anchorCenter(beat.from);
      if (!from) return;
      for (const [to, amount] of Object.entries(beat.to)) {
        const target = anchorCenter(to);
        if (!target || amount <= 0) continue;
        const count = Math.max(1, Math.min(12, Math.ceil(Math.sqrt(amount) * 1.6)));
        for (let i = 0; i < count; i++) {
          spawned.push({
            id: nextId.current++,
            x0: from.x + (Math.random() - 0.5) * 40,
            y0: from.y + (Math.random() - 0.5) * 24,
            x1: target.x + (Math.random() - 0.5) * 60,
            y1: target.y + (Math.random() - 0.5) * 30,
            delay: i * 0.055,
            duration: 0.8,
            emoji: "🍌",
          });
        }
      }
    } else if (beat.kind === "bust") {
      const from = anchorCenter(beat.playerId);
      if (!from) return;
      const count = 14;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 160 + Math.random() * 220;
        spawned.push({
          id: nextId.current++,
          x0: from.x,
          y0: from.y,
          x1: from.x + Math.cos(angle) * dist,
          y1: from.y + Math.sin(angle) * dist + 120,
          delay: 0.35 + Math.random() * 0.15,
          duration: 1.1,
          emoji: i % 4 === 0 ? "💥" : "🍌",
        });
      }
    }

    if (spawned.length === 0) return;
    setFlights((f) => [...f, ...spawned]);
    const ids = new Set(spawned.map((s) => s.id));
    // Removal must outlive this effect (the next beat starts before flights land),
    // so it's tracked in a ref and only cancelled on unmount.
    const t = window.setTimeout(() => {
      setFlights((f) => f.filter((x) => !ids.has(x.id)));
      removalTimers.current.delete(t);
    }, 2200);
    removalTimers.current.add(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatIndex]);

  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      for (const t of timers) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  return (
    <AnimatePresence>
      {flights.map((f) => {
        const arc = f.y1 < f.y0 ? -80 : -120;
        return (
          <motion.span
            key={f.id}
            className="flying"
            initial={{ x: f.x0 - 13, y: f.y0 - 13, opacity: 0, scale: 0.5, rotate: -30 }}
            animate={{
              x: [f.x0 - 13, (f.x0 + f.x1) / 2 - 13, f.x1 - 13],
              y: [f.y0 - 13, Math.min(f.y0, f.y1) + arc, f.y1 - 13],
              opacity: [0, 1, 1, 0.9],
              scale: [0.5, 1.3, 1],
              rotate: [-30, 20, 380],
            }}
            exit={{ opacity: 0, scale: 0.3 }}
            transition={{ duration: f.duration, delay: f.delay, ease: "easeInOut" }}
          >
            {f.emoji}
          </motion.span>
        );
      })}
    </AnimatePresence>
  );
}
