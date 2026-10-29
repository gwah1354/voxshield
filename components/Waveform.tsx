"use client";
import { useEffect, useRef } from "react";

export default function Waveform({ buffer, label }: { buffer: AudioBuffer | null; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    if (!buffer) return;
    g.fillStyle = "#38d0f0";
    const d = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(d.length / c.width));
    const mid = c.height / 2;
    for (let x = 0; x < c.width; x++) {
      let mx = 0;
      for (let i = x * step; i < Math.min(d.length, (x + 1) * step); i++) mx = Math.max(mx, Math.abs(d[i]));
      const h = Math.max(1, mx * mid);
      g.fillRect(x, mid - h, 1, h * 2);
    }
  }, [buffer]);
  return <canvas ref={ref} width={800} height={90} role="img" aria-label={label} className="w-full rounded border border-line bg-ink" />;
}
