import { useEffect, useState } from "react";

interface Props {
  endsAt: number;
  totalSeconds: number;
  clockOffset: number;
}

export function Timer({ endsAt, totalSeconds, clockOffset }: Props) {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now() + clockOffset), 100);
    return () => window.clearInterval(t);
  }, [clockOffset]);

  const remainingMs = Math.max(0, endsAt - now);
  const remaining = Math.ceil(remainingMs / 1000);
  const frac = totalSeconds > 0 ? Math.min(1, remainingMs / (totalSeconds * 1000)) : 0;
  const r = 24;
  const c = 2 * Math.PI * r;
  const urgent = remaining <= 5;

  return (
    <div className={`timer ${urgent ? "urgent" : ""}`} aria-label={`${remaining} seconds left`}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(74,44,23,0.15)" strokeWidth="6" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={urgent ? "#e5484d" : "#4a2c17"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.1s linear" }}
        />
      </svg>
      <span>{remaining}</span>
    </div>
  );
}
