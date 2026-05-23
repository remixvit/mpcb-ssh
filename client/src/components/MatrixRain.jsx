import { useEffect, useRef } from 'react';

export default function MatrixRain({ density = 1, hue = 175 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let raf, drops = [], cols = 0, w = 0, h = 0;
    const fontSize = 14;
    const chars = '01ABCDEF#$%&*<>{}[]/\\|=+-:.~アイウエオカキクケコサシスセソタチツテト'.split('');

    const resize = () => {
      w = c.width = c.offsetWidth * devicePixelRatio;
      h = c.height = c.offsetHeight * devicePixelRatio;
      cols = Math.floor(w / (fontSize * devicePixelRatio));
      drops = Array(cols).fill(0).map(() => Math.random() * -50);
    };
    resize();
    window.addEventListener('resize', resize);

    const baseColor = `hsla(${hue}, 60%, 60%, 0.85)`;
    const headColor = `hsla(${hue}, 90%, 80%, 1)`;
    const fadeColor = 'rgba(7, 7, 15, 0.08)';

    const tick = () => {
      ctx.fillStyle = fadeColor;
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fontSize * devicePixelRatio}px "JetBrains Mono", monospace`;
      for (let i = 0; i < drops.length; i++) {
        if (Math.random() > 0.4 / density) continue;
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize * devicePixelRatio;
        const y = drops[i] * fontSize * devicePixelRatio;
        ctx.fillStyle = Math.random() > 0.96 ? headColor : baseColor;
        ctx.globalAlpha = Math.min(1, 0.15 + Math.random() * 0.6);
        ctx.fillText(text, x, y);
        if (y > h && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 0.4 + Math.random() * 0.6;
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [density, hue]);

  return <canvas ref={canvasRef} className="matrix-canvas" />;
}
