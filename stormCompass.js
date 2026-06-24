const COLORS = {
  LOW: "#38d68f",
  MEDIUM: "#f4b942",
  HIGH: "#ff5a67",
  grid: "rgba(237, 248, 245, 0.16)",
  text: "#edf8f5",
  muted: "#94aaa8",
  center: "#54d9d7",
};

export class StormCompass {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.sectors = [];
    this.confidence = { score: 0, level: "LOW" };
    this.animationFrame = null;
    this.startedAt = performance.now();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  update({ sectors, confidence }) {
    this.sectors = sectors;
    this.confidence = confidence;
    if (!this.animationFrame) {
      this.draw();
    }
  }

  start() {
    const loop = () => {
      this.draw();
      this.animationFrame = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  resize() {
    const size = Math.max(320, Math.floor(this.canvas.getBoundingClientRect().width));
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = size * ratio;
    this.canvas.height = size * ratio;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  draw() {
    const ctx = this.context;
    const size = this.canvas.width / (window.devicePixelRatio || 1);
    const center = size / 2;
    const radius = size * 0.42;
    const time = (performance.now() - this.startedAt) / 1000;

    ctx.clearRect(0, 0, size, size);
    drawBackground(ctx, center, radius, time, this.confidence);
    drawSectors(ctx, center, radius, this.sectors, time);
    drawLabels(ctx, center, radius, this.sectors);
    drawNeedle(ctx, center, radius, time, this.confidence);
    drawCenter(ctx, center, this.confidence);
  }
}

function drawBackground(ctx, center, radius, time, confidence) {
  ctx.save();
  ctx.translate(center, center);
  for (let index = 1; index <= 4; index += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, (radius / 4) * index, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let angle = 0; angle < 360; angle += 22.5) {
    const radians = degreesToRadians(angle - 90);
    ctx.beginPath();
    ctx.moveTo(Math.cos(radians) * radius * 0.24, Math.sin(radians) * radius * 0.24);
    ctx.lineTo(Math.cos(radians) * radius, Math.sin(radians) * radius);
    ctx.strokeStyle = angle % 90 === 0 ? "rgba(237, 248, 245, 0.34)" : COLORS.grid;
    ctx.lineWidth = angle % 90 === 0 ? 1.4 : 0.8;
    ctx.stroke();
  }

  const pulse = 0.5 + Math.sin(time * 2) * 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius * (0.55 + pulse * 0.06), 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(COLORS[confidence.level] || COLORS.LOW, 0.22);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
}

function drawSectors(ctx, center, radius, sectors, time) {
  if (!sectors.length) return;
  const slice = (Math.PI * 2) / sectors.length;
  ctx.save();
  ctx.translate(center, center);

  sectors.forEach((sector, index) => {
    const start = degreesToRadians(sector.bearing - 90) - slice / 2;
    const end = start + slice;
    const outerRadius = radius * (0.62 + sector.riskScore / 260);
    const color = COLORS[sector.status] || COLORS.LOW;
    const alpha = 0.18 + sector.riskScore / 180;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, outerRadius, start, end);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(color, alpha);
    ctx.fill();

    if (sector.riskScore >= 41) {
      const pulse = 0.5 + Math.sin(time * 3 + index) * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, outerRadius + pulse * 8, start + 0.04, end - 0.04);
      ctx.strokeStyle = hexToRgba(color, 0.32);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });

  ctx.restore();
}

function drawLabels(ctx, center, radius, sectors) {
  ctx.save();
  ctx.translate(center, center);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  sectors.forEach((sector) => {
    const radians = degreesToRadians(sector.bearing - 90);
    const labelRadius = radius + 24;
    const x = Math.cos(radians) * labelRadius;
    const y = Math.sin(radians) * labelRadius;
    ctx.fillStyle = sector.riskScore >= 71 ? COLORS.HIGH : COLORS.text;
    ctx.font = "700 13px Inter, system-ui, sans-serif";
    ctx.fillText(sector.direction, x, y);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "700 10px Inter, system-ui, sans-serif";
    ctx.fillText(`${sector.riskScore}%`, x, y + 14);
  });

  ctx.restore();
}

function drawNeedle(ctx, center, radius, time, confidence) {
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(time * 0.16);
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.9);
  ctx.lineTo(5, 0);
  ctx.lineTo(0, radius * 0.16);
  ctx.lineTo(-5, 0);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(COLORS[confidence.level] || COLORS.center, 0.78);
  ctx.shadowColor = COLORS[confidence.level] || COLORS.center;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.restore();
}

function drawCenter(ctx, center, confidence) {
  ctx.save();
  ctx.translate(center, center);
  ctx.beginPath();
  ctx.arc(0, 0, 64, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(7, 16, 21, 0.92)";
  ctx.strokeStyle = hexToRgba(COLORS[confidence.level] || COLORS.center, 0.8);
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.text;
  ctx.font = "900 25px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${confidence.score || 0}%`, 0, -8);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "800 11px Inter, system-ui, sans-serif";
  ctx.fillText(confidence.level || "LOW", 0, 18);
  ctx.restore();
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
