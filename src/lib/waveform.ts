// Canvas-based waveform renderer for a single Float32Array audio buffer.

export function drawWaveform(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  color: string,
  progress: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const mid = cssH / 2;
  const samplesPerPixel = Math.max(1, Math.floor(data.length / cssW));

  // Draw waveform
  for (let x = 0; x < cssW; x++) {
    const start = x * samplesPerPixel;
    let min = 1.0;
    let max = -1.0;
    for (let i = 0; i < samplesPerPixel && start + i < data.length; i++) {
      const s = data[start + i];
      if (s < min) min = s;
      if (s > max) max = s;
    }
    const yMin = mid + min * mid * 0.9;
    const yMax = mid + max * mid * 0.9;

    // Played portion gets full color, unplayed gets dimmed
    const played = x / cssW <= progress;
    ctx.fillStyle = played ? color : color + '40';
    ctx.fillRect(x, yMin, 1, Math.max(1, yMax - yMin));
  }

  // Progress line
  if (progress > 0 && progress < 1) {
    const px = Math.floor(progress * cssW);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px, 0, 1.5, cssH);
  }
}
