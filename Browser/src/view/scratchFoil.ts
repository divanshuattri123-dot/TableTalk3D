type Point = Readonly<{ x: number; y: number }>;

interface ScratchFlake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  duration: number;
  shade: number;
}

export interface ScratchBurst {
  readonly createdAt: number;
  readonly flakes: readonly ScratchFlake[];
}

function noise(seed: number) {
  let value = (seed ^ (seed >>> 16)) >>> 0;
  value = Math.imul(value, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

const reflectionCurve = Float32Array.from({ length: 1025 }, (_, index) => Math.exp(-((index / 256) ** 2)));
const lightBand = (distance: number) => reflectionCurve[Math.min(1024, (Math.abs(distance) * 256) | 0)]!;
export function paintScratchFoil(ctx: CanvasRenderingContext2D, width: number, height: number) {
  if (width <= 0 || height <= 0) return;
  const metal = ctx.createImageData(width, height);
  const pixels = metal.data;
  const sideShade = Float32Array.from({ length: width }, (_, column) => Math.abs(2 * column / width - 1) ** 12);
  for (let row = 0; row < height; row++) {
    const v = row / height;
    const rowSalt = Math.imul(row, 0x9e3779b1);
    const brushLine = (noise(rowSalt) - .5) * 12;
    const verticalEdge = Math.abs(2 * v - 1) ** 9;
    for (let column = 0; column < width; column++) {
      const u = column / width;
      const glint = (u - (.25 + .23 * v)) / .17;
      const reflection = (u - (.82 - .09 * v)) / .21;
      const darkBand = (u - (.56 + .07 * v)) / .15;
      // Grain follows the brush direction. Broad reflections give the coating depth without a repeating pattern.
      const grain = (noise(column ^ rowSalt) - .5) * 14
        + (noise((column >>> 3) ^ rowSalt) - .5) * 7;
      const edge = 12 * (verticalEdge + sideShade[column]!);
      const silver = 162 + 66 * lightBand(glint) + 45 * lightBand(reflection)
        - 27 * lightBand(darkBand) + brushLine + grain - edge;
      const index = 4 * (row * width + column);
      pixels[index] = silver - 7;
      pixels[index + 1] = silver + 1;
      pixels[index + 2] = silver + 4;
      pixels[index + 3] = 255;
    }
  }
  ctx.putImageData(metal, 0, 0);

  ctx.save();
  ctx.setTransform(width / 420, 0, 0, height / 155, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#f5ffffa0";
  ctx.strokeRect(3.5, 3.5, 413, 148);
  ctx.strokeStyle = "#283c4690";
  ctx.strokeRect(5.5, 5.5, 409, 144);
  ctx.strokeStyle = "#f9ffff62";
  ctx.strokeRect(7.5, 7.5, 405, 140);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 25px system-ui, sans-serif";
  // The thin light edge makes the dark lettering read like ink on stamped metal.
  ctx.fillStyle = "#efffff9c";
  ctx.fillText("SCRATCH HERE", 210, 78.5);
  ctx.fillStyle = "#172d37";
  ctx.fillText("SCRATCH HERE", 210, 77);
  ctx.restore();
}

export function eraseScratchFoil(
  ctx: CanvasRenderingContext2D, from: Point, to: Point, diameter: number, seed: number
) {
  if (diameter <= 0) return;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.min(72, Math.max(1, Math.ceil(distance / (diameter * .15))));
  const normalX = distance ? (from.y - to.y) / distance : 0;
  const normalY = distance ? (to.x - from.x) / distance : 0;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#fff";
  for (const fringe of [true, false]) {
    ctx.beginPath();
    for (let index = 0; index <= steps; index++) {
      const part = index / steps;
      const seedAtStep = seed + index * 173;
      const drift = (noise(seedAtStep + 11) - .5) * diameter * .16;
      const x = from.x + (to.x - from.x) * part + drift * normalX;
      const y = from.y + (to.y - from.y) * part + drift * normalY;
      const radius = diameter * ((fringe ? .42 : .36) + noise(seedAtStep) * .1);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
    }
    ctx.globalAlpha = fringe ? .34 : 1;
    ctx.fill();
  }
  ctx.restore();
}

export function createScratchBurst(from: Point, to: Point, createdAt: number, seed: number): ScratchBurst {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = length > .5 ? Math.atan2(to.y - from.y, to.x - from.x) : -Math.PI / 3;
  const count = Math.min(10, Math.max(3, Math.floor(length / 6)));
  const flakes: ScratchFlake[] = [];
  for (let index = 0; index < count; index++) {
    const unit = (offset: number) => noise(seed + index * 271 + offset * 43);
    const along = unit(0);
    const offset = (unit(1) - .5) * 28;
    const scatter = angle + (unit(2) - .5) * Math.PI * 1.6;
    const speed = 31 + unit(3) * 112;
    flakes.push({
      x: from.x + (to.x - from.x) * along - Math.sin(angle) * offset,
      y: from.y + (to.y - from.y) * along + Math.cos(angle) * offset,
      vx: Math.cos(scatter) * speed,
      vy: Math.sin(scatter) * speed - 32,
      size: 1 + unit(4) ** 2 * 3.4,
      rotation: unit(5) * 2 * Math.PI,
      spin: (unit(6) - .5) * 18,
      duration: 255 + unit(7) * 295,
      shade: Math.floor(unit(8) * 3)
    });
  }
  return { createdAt, flakes };
}

const foilShades = ["#d4dfdd", "#faf7e5", "#a5b4b6"] as const;

export function paintScratchFlakes(ctx: CanvasRenderingContext2D, bursts: readonly ScratchBurst[], now: number) {
  ctx.save();
  ctx.resetTransform();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalCompositeOperation = "source-over";
  let active = false;
  for (const burst of bursts) {
    const age = Math.max(0, now - burst.createdAt);
    for (const flake of burst.flakes) {
      if (age >= flake.duration) continue;
      active = true;
      const time = age / 1000;
      const progress = age / flake.duration;
      const drift = time * (1 - .4 * time);
      const twist = flake.rotation + flake.spin * time;
      const size = flake.size * (1 - .22 * progress);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - progress) * 2.5);
      ctx.translate(flake.x + flake.vx * drift, flake.y + flake.vy * drift + 160 * time * time);
      ctx.rotate(twist);
      ctx.scale(1, .28 + .72 * Math.abs(Math.cos(twist)));
      // Two faces of each curled fragment alternate between a flash and the matte backing.
      ctx.fillStyle = Math.sin(twist) > -.3 ? foilShades[flake.shade]! : "#65777c";
      ctx.beginPath();
      ctx.moveTo(-size, size * .22);
      ctx.lineTo(-size * .32, -size * .64);
      ctx.lineTo(size, -size * .19);
      ctx.lineTo(size * .51, size * .57);
      ctx.lineTo(-size * .36, size * .76);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#384b54aa";
      ctx.beginPath();
      ctx.moveTo(-size, size * .22);
      ctx.lineTo(size, -size * .19);
      ctx.lineTo(size * .51, size * .57);
      ctx.lineTo(-size * .36, size * .76);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  return active;
}
