const tideValueEl = document.getElementById("tide-value");
const tideStatusEl = document.getElementById("tide-status");
const tideNextEl = document.getElementById("tide-next");

const STATION_ID = "9448094";
const APP_NAME = "camanotide";

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function buildNoaaUrl() {
  const params = new URLSearchParams({
    product: "predictions",
    application: APP_NAME,
    begin_date: todayYmd(),
    range: "48",
    datum: "MLLW",
    station: STATION_ID,
    time_zone: "lst_ldt",
    units: "english",
    interval: "hilo",
    format: "json",
  });
  return `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params.toString()}`;
}

function parsePrediction(p) {
  return {
    time: new Date(p.t.replace(" ", "T")),
    value: Number(p.v),
    type: p.type,
  };
}

function interpolate(now, left, right) {
  const totalMs = right.time - left.time;
  if (totalMs <= 0) return left.value;
  const partMs = now - left.time;
  const ratio = Math.max(0, Math.min(1, partMs / totalMs));
  return left.value + (right.value - left.value) * ratio;
}

function softPastelColor(tide, minTide, maxTide, rising) {
  const span = Math.max(0.1, maxTide - minTide);
  const level = Math.max(0, Math.min(1, (tide - minTide) / span));

  const hueA = Math.round(205 - level * 40 + (rising ? 8 : -8));
  const hueB = Math.round(50 + level * 35 + (rising ? -6 : 6));
  const satA = 72;
  const satB = 82;
  const litA = Math.round(92 - level * 5);
  const litB = Math.round(89 - (1 - level) * 4);

  return {
    a: `hsl(${hueA} ${satA}% ${litA}%)`,
    b: `hsl(${hueB} ${satB}% ${litB}%)`,
    ink: level > 0.58 ? "#113146" : "#1f3041",
  };
}

function formatTime(dt) {
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function updateUi(current, rising, nextTurn, minTide, maxTide) {
  tideValueEl.textContent = `${current.toFixed(2)} ft`;
  tideStatusEl.textContent = rising ? "Tide is rising" : "Tide is falling";

  if (nextTurn) {
    const highLow = nextTurn.type === "H" ? "high" : "low";
    tideNextEl.textContent = `Next ${highLow}: ${nextTurn.value.toFixed(2)} ft at ${formatTime(nextTurn.time)}`;
  } else {
    tideNextEl.textContent = "No next turn found in current prediction window.";
  }

  const colors = softPastelColor(current, minTide, maxTide, rising);
  document.documentElement.style.setProperty("--bg-a", colors.a);
  document.documentElement.style.setProperty("--bg-b", colors.b);
  document.documentElement.style.setProperty("--ink", colors.ink);
}

function findBracket(predictions, now) {
  let left = null;
  let right = null;

  for (let i = 0; i < predictions.length; i += 1) {
    const p = predictions[i];
    if (p.time <= now) {
      left = p;
    }
    if (p.time > now) {
      right = p;
      break;
    }
  }

  return { left, right };
}

async function loadAndRender() {
  try {
    const res = await fetch(buildNoaaUrl());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = await res.json();
    const rows = Array.isArray(payload.predictions) ? payload.predictions : [];
    if (rows.length < 2) throw new Error("No tide predictions returned");

    const predictions = rows.map(parsePrediction).filter((p) => !Number.isNaN(p.value) && !Number.isNaN(p.time.getTime()));
    if (predictions.length < 2) throw new Error("Invalid prediction data");

    const now = new Date();
    const { left, right } = findBracket(predictions, now);
    if (!left || !right) throw new Error("Current time out of prediction range");

    const current = interpolate(now, left, right);
    const rising = right.value > left.value;
    const minTide = Math.min(...predictions.map((p) => p.value));
    const maxTide = Math.max(...predictions.map((p) => p.value));

    updateUi(current, rising, right, minTide, maxTide);
  } catch (err) {
    tideValueEl.textContent = "--.- ft";
    tideStatusEl.textContent = "Could not load tide";
    tideNextEl.textContent = err.message;
  }
}

loadAndRender();
setInterval(loadAndRender, 5 * 60 * 1000);
