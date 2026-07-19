const TAU = Math.PI * 2;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobileViewport = window.matchMedia("(max-width: 560px)");
const modeFieldRedrawers = [];

const evidenceData = {
  checkpoints: ["30k", "102k", "204k", "250k"],
  loss: [4.03, 3.38, 3.24, 3.16],
  edmd: [
    { checkpoint: "30k", value: 0.0113 },
    { checkpoint: "102k", value: 0.0079 },
    { checkpoint: "204k", value: 0.0077 },
    { checkpoint: "250k", value: 0.0078 }
  ],
  phaseFinal: [
    { label: "negative", value: 986 },
    { label: "positive", value: 1062 }
  ],
  memory: {
    checkpoints: ["30k", "204k", "250k"],
    nearUnit: [2, 2, 6],
    longHalfLife: [0, 1, 1]
  }
};

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeModes(count, seed) {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const familyPick = rand();
    const family = familyPick < 0.33 ? "slow" : familyPick < 0.72 ? "mid" : "fast";
    const band = family === "slow" ? 0.24 : family === "mid" ? 0.55 : 0.88;
    const theta = rand() * TAU;
    const radius = 0.2 + band * 0.72 + (rand() - 0.5) * 0.12;
    const height = (rand() - 0.5) * (family === "slow" ? 0.7 : family === "mid" ? 1.1 : 1.6);
    return {
      index,
      family,
      x: Math.cos(theta) * radius + (rand() - 0.5) * 0.18,
      y: Math.sin(theta) * radius + (rand() - 0.5) * 0.18,
      z: height,
      phase: theta,
      energy: 0.35 + rand() * 0.65,
      drift: 0.25 + rand() * 1.15
    };
  });
}

const modes = makeModes(180, 48211);
const promptTokens = ["The", "model", "tracks", "memory", "through", "signed", "spectral", "modes"];

function familyColor(family, alpha = 1) {
  const map = {
    slow: `rgba(55, 230, 212, ${alpha})`,
    mid: `rgba(255, 200, 87, ${alpha})`,
    fast: `rgba(255, 93, 115, ${alpha})`
  };
  return map[family];
}

function project3d(point, angle, width, height, scale = 1) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point.x * cos - point.z * sin;
  const z = point.x * sin + point.z * cos;
  const depth = 2.6 + z;
  const perspective = 1.45 / depth;
  return {
    x: width * 0.5 + x * width * 0.34 * perspective * scale,
    y: height * 0.52 + point.y * height * 0.44 * perspective * scale,
    size: Math.max(1.5, (point.energy * 7.5 + 1.5) * perspective),
    depth
  };
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, width * 0.62);
  gradient.addColorStop(0, "rgba(78,168,255,0.10)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height * 0.52, width * (0.18 + i * 0.07), height * (0.11 + i * 0.045), 0, 0, TAU);
    ctx.stroke();
  }
}

function tokenTracePoint(i, total) {
  const t = total <= 1 ? 0 : i / (total - 1);
  const theta = -1.95 + t * 4.35;
  const radius = 0.42 + Math.sin(t * Math.PI) * 0.38;
  return {
    x: Math.cos(theta) * radius + (t - 0.5) * 0.35,
    y: Math.sin(theta * 1.18) * 0.42 + Math.cos(t * Math.PI * 2) * 0.14,
    z: -0.75 + t * 1.5
  };
}

function drawLabelBubble(ctx, x, y, text, color, align = "left") {
  const fontSize = Math.max(12, Math.min(18, ctx.canvas.width * 0.018));
  ctx.font = `800 ${fontSize}px ui-sans-serif, system-ui`;
  const paddingX = fontSize * 0.62;
  const paddingY = fontSize * 0.38;
  const textWidth = ctx.measureText(text).width;
  const width = textWidth + paddingX * 2;
  const height = fontSize + paddingY * 2;
  const boxX = align === "right" ? x - width : align === "center" ? x - width * 0.5 : x;
  const boxY = y - height * 0.5;
  ctx.fillStyle = "rgba(7, 9, 13, 0.76)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(boxX, boxY, width, height, 7);
  } else {
    ctx.rect(boxX, boxY, width, height);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(237,244,255,0.96)";
  ctx.fillText(text, boxX + paddingX, boxY + paddingY + fontSize * 0.78);
}

function drawTokenPath3d(ctx, width, height, angle, scale, time) {
  const points = promptTokens.map((token, i) => {
    const t = promptTokens.length <= 1 ? 0 : i / (promptTokens.length - 1);
    const theta = -2.25 + t * TAU * 1.16;
    const radius = 0.78 + Math.sin(t * Math.PI) * 0.24 + (i % 2) * 0.1;
    const drift = time * (0.85 + i * 0.045);
    const floatPoint = {
      x: Math.cos(theta) * radius + Math.sin(drift + i * 1.7) * 0.085,
      y: Math.sin(theta * 1.38) * 0.36 + Math.sin(drift * 1.35 + i * 0.9) * 0.06,
      z: Math.sin(theta) * radius + Math.cos(drift * 0.9 + i * 1.2) * 0.16,
      energy: 0.68 + Math.sin(time * 1.4 + t * TAU) * 0.14
    };
    const projected = project3d(floatPoint, angle, width, height, scale);
    return {
      token,
      ...projected,
      size: Math.max(projected.size, width * 0.006)
    };
  });

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.beginPath();
  points.forEach((point, i) => {
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(237,244,255,0.5)";
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const arrowX = start.x + dx * 0.68;
    const arrowY = start.y + dy * 0.68;
    const arrowSize = Math.max(4, width * 0.006);
    ctx.beginPath();
    ctx.moveTo(arrowX + ux * arrowSize, arrowY + uy * arrowSize);
    ctx.lineTo(arrowX - ux * arrowSize * 0.8 + nx * arrowSize * 0.55, arrowY - uy * arrowSize * 0.8 + ny * arrowSize * 0.55);
    ctx.lineTo(arrowX - ux * arrowSize * 0.8 - nx * arrowSize * 0.55, arrowY - uy * arrowSize * 0.8 - ny * arrowSize * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  const segmentCount = Math.max(1, points.length - 1);
  const sparkClock = time * 6.8;
  const segmentIndex = Math.floor(sparkClock) % segmentCount;
  const segmentProgress = sparkClock - Math.floor(sparkClock);
  const easedProgress = 1 - Math.pow(1 - segmentProgress, 2.2);
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentLength = Math.hypot(dx, dy) || 1;
  const ux = dx / segmentLength;
  const uy = dy / segmentLength;
  const nx = -uy;
  const ny = ux;
  const head = {
    x: start.x + dx * easedProgress,
    y: start.y + dy * easedProgress
  };
  const sparkSpan = Math.min(segmentLength * 0.34, Math.max(26, width * 0.055));
  const tailStartProgress = Math.max(0, easedProgress - sparkSpan / segmentLength);
  const tailStart = {
    x: start.x + dx * tailStartProgress,
    y: start.y + dy * tailStartProgress
  };
  const pulse = Math.sin(time * 88) * 0.5 + 0.5;
  const fork = Math.max(4, width * 0.006) * (0.7 + pulse * 0.6);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(255, 238, 166, 0.78)";
  ctx.lineWidth = Math.max(1.5, width * 0.003);
  ctx.beginPath();
  ctx.moveTo(tailStart.x, tailStart.y);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(55, 230, 212, 0.72)";
  ctx.lineWidth = Math.max(1, width * 0.002);
  ctx.beginPath();
  ctx.moveTo(head.x - ux * fork, head.y - uy * fork);
  ctx.lineTo(head.x + nx * fork * 0.8, head.y + ny * fork * 0.8);
  ctx.moveTo(head.x - ux * fork * 0.55, head.y - uy * fork * 0.55);
  ctx.lineTo(head.x - nx * fork * 0.65, head.y - ny * fork * 0.65);
  ctx.stroke();

  const glowRadius = Math.max(8, width * 0.014);
  const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, glowRadius);
  glow.addColorStop(0, "rgba(255,255,255,0.96)");
  glow.addColorStop(0.35, "rgba(55,230,212,0.5)");
  glow.addColorStop(1, "rgba(255,93,115,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(head.x, head.y, glowRadius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.98)";
  ctx.beginPath();
  ctx.arc(head.x, head.y, Math.max(2.3, width * 0.0032), 0, TAU);
  ctx.fill();
  ctx.restore();

  points.forEach((point, i) => {
    const color = i < 3 ? familyColor("slow", 0.96) : i < 6 ? familyColor("mid", 0.96) : familyColor("fast", 0.96);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(point.x, point.y, Math.max(5, point.size * 1.8), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const offsetY = i % 2 === 0 ? -24 : 24;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x, point.y + offsetY);
    ctx.stroke();
    drawLabelBubble(ctx, point.x, point.y + offsetY, point.token, color, "center");
  });
}

function drawModeField(canvas, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const readout = options.tokenPath ? document.getElementById("modeReadout") : null;
  let mouse = null;
  let animationFrameId = null;
  let isVisible = !("IntersectionObserver" in window);
  let lastDraw = 0;

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse = {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  });

  canvas.addEventListener("pointerleave", () => {
    mouse = null;
    if (readout) readout.textContent = options.tokenPath ? "synthetic prompt path" : "hover a mode";
  });

  function scheduleFrame() {
    if (prefersReducedMotion || !isVisible || animationFrameId !== null) return;
    animationFrameId = requestAnimationFrame(frame);
  }

  function frame(now, scheduleNext = true) {
    animationFrameId = null;
    if (scheduleNext && mobileViewport.matches && now - lastDraw < 34) {
      scheduleFrame();
      return;
    }
    lastDraw = now;

    const { width, height } = resizeCanvas(canvas);
    const time = prefersReducedMotion ? 0 : now * 0.00018;
    const angle = options.slow ? time * 0.5 : time;
    const activeModes = mobileViewport.matches ? modes.slice(0, 120) : modes;
    ctx.clearRect(0, 0, width, height);
    drawBackground(ctx, width, height);

    const projected = activeModes
      .map((mode) => {
        const wobble = Math.sin(time * mode.drift + mode.phase) * 0.04;
        const point = { ...mode, y: mode.y + wobble };
        return { mode, ...project3d(point, angle, width, height, options.scale || 1) };
      })
      .sort((a, b) => b.depth - a.depth);

    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    projected.slice(0, mobileViewport.matches ? 24 : 42).forEach((point, i) => {
      const other = projected[(i * 7 + 19) % projected.length];
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(other.x, other.y);
      ctx.stroke();
    });

    let nearest = null;
    for (const point of projected) {
      const pulseAmount = mobileViewport.matches ? 0.08 : 0.18;
      const pulse = 1 + Math.sin(time * 6 + point.mode.phase) * pulseAmount;
      const size = point.size * pulse;
      ctx.beginPath();
      ctx.fillStyle = familyColor(point.mode.family, 0.18);
      ctx.arc(point.x, point.y, size * 2.8, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = familyColor(point.mode.family, 0.88);
      ctx.arc(point.x, point.y, size, 0, TAU);
      ctx.fill();

      if (mouse) {
        const dx = point.x - mouse.x;
        const dy = point.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 18 && (!nearest || dist < nearest.dist)) {
          nearest = { ...point, dist };
        }
      }
    }

    if (options.tokenPath) {
      drawTokenPath3d(ctx, width, height, angle, options.scale || 1, time);
    }

    if (nearest && readout) {
      readout.textContent = `${nearest.mode.family} synthetic mode ${nearest.mode.index}`;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(nearest.x, nearest.y, nearest.size * 3.6, 0, TAU);
      ctx.stroke();
    } else if (readout) {
      readout.textContent = options.tokenPath ? "synthetic prompt path" : "hover a mode";
    }

    if (scheduleNext) scheduleFrame();
  }

  const redraw = () => frame(performance.now(), false);
  modeFieldRedrawers.push(redraw);

  if (prefersReducedMotion) {
    redraw();
  } else if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) {
          scheduleFrame();
        } else if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      },
      { rootMargin: "120px 0px" }
    );
    observer.observe(canvas);
  } else {
    scheduleFrame();
  }
}

function drawPromptTrace(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = resizeCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(width * 0.08, height * 0.13, width * 0.84, height * 0.72);

  const traces = [
    ["rgba(55,230,212,0.95)", 0.15, 0.33],
    ["rgba(255,200,87,0.95)", 0.42, 0.17],
    ["rgba(255,93,115,0.95)", 0.71, 0.51]
  ];

  traces.forEach(([color, start, phase]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, width * 0.006);
    ctx.beginPath();
    for (let i = 0; i < 64; i += 1) {
      const t = i / 63;
      const x = width * (0.1 + t * 0.8);
      const y = height * (0.5 + Math.sin((t * 3.6 + phase) * TAU) * 0.22 + (start - 0.5) * 0.35 * (1 - t));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  const pathPoints = promptTokens.map((token, i) => {
    const t = i / (promptTokens.length - 1);
    return {
      token,
      x: width * (0.1 + t * 0.8),
      y: height * (0.5 + Math.sin((t * 2.4 + 0.18) * TAU) * 0.22)
    };
  });

  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = Math.max(2, width * 0.005);
  ctx.beginPath();
  pathPoints.forEach((point, i) => {
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  pathPoints.forEach((point, i) => {
    const color = i < 3 ? familyColor("slow", 0.96) : i < 6 ? familyColor("mid", 0.96) : familyColor("fast", 0.96);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(point.x, point.y, Math.max(3, width * 0.009), 0, TAU);
    ctx.fill();
    if (i % 2 === 0 || width > 700) {
      drawLabelBubble(ctx, point.x + 8, point.y - 16, point.token, color, "left");
    }
  });
}

function drawConcordance(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = resizeCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const left = width * 0.12;
  const bottom = height * 0.82;
  const plotW = width * 0.74;
  const plotH = height * 0.62;

  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, bottom - plotH);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left + plotW, bottom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(78,168,255,0.95)";
  ctx.lineWidth = Math.max(2, width * 0.006);
  ctx.beginPath();
  for (let i = 0; i < 80; i += 1) {
    const t = i / 79;
    const x = left + t * plotW;
    const y = bottom - plotH * (0.14 + 0.74 * t + Math.sin(t * TAU * 2) * 0.035);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const rand = seededRandom(811);
  ctx.fillStyle = "rgba(255,200,87,0.9)";
  for (let i = 0; i < 44; i += 1) {
    const t = rand();
    const x = left + t * plotW;
    const expected = 0.14 + 0.74 * t;
    const y = bottom - plotH * (expected + (rand() - 0.5) * 0.18);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, width * 0.007), 0, TAU);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(149,164,184,0.92)";
  ctx.font = `${Math.max(11, width * 0.033)}px ui-sans-serif, system-ui`;
  ctx.fillText("learned structure", left + plotW * 0.45, bottom - plotH - 10);
  ctx.fillText("measured trajectory", left + 8, bottom + 24);
}

function chartFrame(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const { width, height } = resizeCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const pad = {
    left: width * 0.14,
    right: width * 0.06,
    top: height * 0.12,
    bottom: height * 0.18
  };
  const chart = {
    x: pad.left,
    y: pad.top,
    w: width - pad.left - pad.right,
    h: height - pad.top - pad.bottom
  };
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fillRect(chart.x, chart.y, chart.w, chart.h);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chart.x, chart.y);
  ctx.lineTo(chart.x, chart.y + chart.h);
  ctx.lineTo(chart.x + chart.w, chart.y + chart.h);
  ctx.stroke();
  return { ctx, width, height, chart };
}

function drawLineChart(canvas, labels, series, options) {
  const frame = chartFrame(canvas);
  if (!frame) return;
  const { ctx, width, height, chart } = frame;
  const values = series.flatMap((s) => s.values);
  const min = options.min ?? Math.min(...values);
  const max = options.max ?? Math.max(...values);
  const xAt = (i) => chart.x + (i / (labels.length - 1)) * chart.w;
  const yAt = (value) => chart.y + (1 - (value - min) / (max - min)) * chart.h;

  ctx.fillStyle = "rgba(149,164,184,0.9)";
  ctx.font = `${Math.max(11, width * 0.028)}px ui-sans-serif, system-ui`;
  ctx.fillText(options.yLabel, chart.x, chart.y - 12);

  labels.forEach((label, i) => {
    ctx.fillStyle = "rgba(149,164,184,0.78)";
    ctx.fillText(label, xAt(i) - 12, chart.y + chart.h + height * 0.08);
  });

  series.forEach((s) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.max(2, width * 0.006);
    ctx.beginPath();
    s.values.forEach((value, i) => {
      const x = xAt(i);
      const y = yAt(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    s.values.forEach((value, i) => {
      ctx.beginPath();
      ctx.fillStyle = s.color;
      ctx.arc(xAt(i), yAt(value), Math.max(3, width * 0.009), 0, TAU);
      ctx.fill();
    });
  });
}

function drawBarChart(canvas, labels, values, options) {
  const frame = chartFrame(canvas);
  if (!frame) return;
  const { ctx, width, height, chart } = frame;
  const max = options.max ?? Math.max(...values) * 1.15;
  const barW = (chart.w / labels.length) * 0.54;

  ctx.fillStyle = "rgba(149,164,184,0.9)";
  ctx.font = `${Math.max(11, width * 0.028)}px ui-sans-serif, system-ui`;
  ctx.fillText(options.yLabel, chart.x, chart.y - 12);

  values.forEach((value, i) => {
    const x = chart.x + (i + 0.5) * (chart.w / labels.length) - barW / 2;
    const h = chart.h * (value / max);
    const y = chart.y + chart.h - h;
    ctx.fillStyle = options.colors?.[i] || "rgba(78,168,255,0.9)";
    ctx.fillRect(x, y, barW, h);
    ctx.fillStyle = "rgba(237,244,255,0.94)";
    ctx.fillText(String(value), x + barW * 0.25, y - 8);
    ctx.fillStyle = "rgba(149,164,184,0.78)";
    ctx.fillText(labels[i], x - 4, chart.y + chart.h + height * 0.08);
  });
}

function drawEvidenceCharts() {
  drawLineChart(
    document.getElementById("lossEvidenceCanvas"),
    evidenceData.checkpoints,
    [{ values: evidenceData.loss, color: "rgba(78,168,255,0.95)" }],
    { min: 3.0, max: 4.15, yLabel: "best loss" }
  );

  drawLineChart(
    document.getElementById("edmdEvidenceCanvas"),
    evidenceData.edmd.map((d) => d.checkpoint),
    [{ values: evidenceData.edmd.map((d) => d.value), color: "rgba(55,230,212,0.95)" }],
    { min: 0.0065, max: 0.012, yLabel: "mean distance" }
  );

  drawBarChart(
    document.getElementById("phaseEvidenceCanvas"),
    evidenceData.phaseFinal.map((d) => d.label),
    evidenceData.phaseFinal.map((d) => d.value),
    {
      max: 1200,
      yLabel: "mode count",
      colors: ["rgba(255,93,115,0.92)", "rgba(55,230,212,0.92)"]
    }
  );

  drawLineChart(
    document.getElementById("memoryEvidenceCanvas"),
    evidenceData.memory.checkpoints,
    [
      { values: evidenceData.memory.nearUnit, color: "rgba(255,200,87,0.95)" },
      { values: evidenceData.memory.longHalfLife, color: "rgba(255,93,115,0.95)" }
    ],
    { min: 0, max: 8, yLabel: "mode count" }
  );
}

let resizeFrameId = null;
window.addEventListener("resize", () => {
  if (resizeFrameId !== null) return;
  resizeFrameId = requestAnimationFrame(() => {
    modeFieldRedrawers.forEach((redraw) => redraw());
    drawPromptTrace(document.getElementById("promptCanvas"));
    drawConcordance(document.getElementById("concordanceCanvas"));
    drawEvidenceCharts();
    resizeFrameId = null;
  });
});

drawModeField(document.getElementById("heroField"), { scale: 1.08, slow: true });
drawModeField(document.getElementById("atlasCanvas"), { scale: 1, tokenPath: true });
drawPromptTrace(document.getElementById("promptCanvas"));
drawConcordance(document.getElementById("concordanceCanvas"));
drawEvidenceCharts();
