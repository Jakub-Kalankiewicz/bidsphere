import { readFile, writeFile } from "node:fs/promises";

const processed = new URL("../measurements/processed/", import.meta.url);
const figures = new URL("../measurements/figures/", import.meta.url);

function parseCsv(text) {
  return text.trim().split(/\r?\n/).map((line) => line.split(","));
}

const timingRows = parseCsv(await readFile(new URL("benchmark-timing-overview.csv", processed), "utf8"));
const timingHeader = timingRows.shift();
const t = Object.fromEntries(timingRows.map((row) => [row[0] + "|" + row[1], {
  model: row[0], profile: row[1], online: Number(row[5]), offline: Number(row[7]),
}]));

const gasRows = parseCsv(await readFile(new URL("benchmark-gas-overview.csv", processed), "utf8"));
gasRows.shift();
const gas = gasRows.map((row) => ({
  batch: Number(row[0]), individual: Number(row[2]), merkle: Number(row[3]),
}));

const colors = { home: "#2563eb", limited: "#ea580c", individual: "#64748b", merkle: "#16a34a" };
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const text = (x, y, value, extra = "") => `<text x="${x}" y="${y}" ${extra}>${esc(value)}</text>`;
const fmt = (value) => Math.round(value).toLocaleString("en-US");

function frame(width, height, title, subtitle) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title><desc id="desc">${esc(subtitle)}</desc>
<style>text{font-family:Arial,sans-serif;fill:#111827}.title{font-size:20px;font-weight:700}.axis{font-size:12px}.label{font-size:11px}.grid{stroke:#d1d5db;stroke-width:1}.bar{shape-rendering:crispEdges}.legend{font-size:12px}</style>`;
}

function onlineChart() {
  const width = 920, height = 540, left = 92, right = 30, top = 72, bottom = 92;
  const plotW = width - left - right, plotH = height - top - bottom, max = 20000;
  const models = ["Whiteboard", "God's Hand", "Robotic Arm v2"];
  let out = frame(width, height, "Czas weryfikacji online według modelu i profilu sieci", "Mediana online_total_ms; lokalny węzeł RPC Hardhat");
  out += text(width / 2, 30, "Czas weryfikacji online według modelu i profilu sieci", 'class="title" text-anchor="middle"');
  out += text(width / 2, 50, "Mediana online_total_ms; lokalny węzeł RPC Hardhat", 'class="axis" text-anchor="middle"');
  for (let tick = 0; tick <= max; tick += 5000) {
    const y = top + plotH - (tick / max) * plotH;
    out += `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="grid"/>`;
    out += text(left - 10, y + 4, `${tick / 1000} s`, 'class="axis" text-anchor="end"');
  }
  const groupW = plotW / models.length;
  models.forEach((model, index) => {
    const center = left + groupW * (index + 0.5);
    const entries = [["home-unrestricted", colors.home, "Sieć domowa"], ["limited-emulated", colors.limited, "Sieć ograniczona"]];
    entries.forEach(([profile, color], barIndex) => {
      const value = t[`${model}|${profile}`].online;
      const barW = 58, x = center - 66 + barIndex * 70, h = (value / max) * plotH, y = top + plotH - h;
      out += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" class="bar"/>`;
      out += text(x + barW / 2, y - 7, `${fmt(value)} ms`, 'class="label" text-anchor="middle"');
    });
    out += text(center, height - 58, model, 'class="axis" text-anchor="middle"');
  });
  out += `<rect x="${width - 255}" y="${height - 38}" width="14" height="14" fill="${colors.home}"/><text x="${width - 235}" y="${height - 27}" class="legend">Sieć domowa</text>`;
  out += `<rect x="${width - 125}" y="${height - 38}" width="14" height="14" fill="${colors.limited}"/><text x="${width - 105}" y="${height - 27}" class="legend">Sieć ograniczona</text>`;
  out += text(18, top + plotH / 2, "Czas online [ms]", 'class="axis" transform="rotate(-90 18 ' + (top + plotH / 2) + ')" text-anchor="middle"');
  return `${out}</svg>`;
}

function gasChart() {
  const width = 920, height = 540, left = 92, right = 30, top = 72, bottom = 82;
  const plotW = width - left - right, plotH = height - top - bottom, max = 180000;
  let out = frame(width, height, "Koszt gazu na model według rozmiaru partii", "Mediana jednostek gazu na model; lokalny Hardhat");
  out += text(width / 2, 30, "Koszt gazu na model według rozmiaru partii", 'class="title" text-anchor="middle"');
  out += text(width / 2, 50, "Mediana jednostek gazu na model; lokalny Hardhat", 'class="axis" text-anchor="middle"');
  for (let tick = 0; tick <= max; tick += 30000) {
    const y = top + plotH - (tick / max) * plotH;
    out += `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="grid"/>`;
    out += text(left - 10, y + 4, `${tick / 1000}k`, 'class="axis" text-anchor="end"');
  }
  const x = (index) => left + (index / (gas.length - 1)) * plotW;
  const y = (value) => top + plotH - (value / max) * plotH;
  for (const [key, color, label] of [["individual", colors.individual, "Individual"], ["merkle", colors.merkle, "Merkle"]]) {
    const points = gas.map((row, index) => `${x(index)},${y(row[key])}`).join(" ");
    const path = gas.map((row, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(row[key])}`).join(" ");
    out += `<path d="${path}" fill="none" stroke="${color}" stroke-width="3"/>`;
    gas.forEach((row, index) => {
      out += `<circle cx="${x(index)}" cy="${y(row[key])}" r="5" fill="${color}"/>`;
      if (key === "merkle") out += text(x(index), y(row[key]) - 10, `${fmt(row[key])}`, 'class="label" text-anchor="middle"');
    });
    const polishLabel = key === "individual" ? "Rejestracja indywidualna" : "Rejestracja Merkle";
    const lx = width - 330 + (key === "merkle" ? 180 : 0);
    out += `<line x1="${lx}" y1="${height - 28}" x2="${lx + 22}" y2="${height - 28}" stroke="${color}" stroke-width="3"/><text x="${lx + 28}" y="${height - 24}" class="legend">${polishLabel}</text>`;
  }
  gas.forEach((row, index) => out += text(x(index), height - 52, String(row.batch), 'class="axis" text-anchor="middle"'));
  out += text(width / 2, height - 15, "Rozmiar partii [modele]", 'class="axis" text-anchor="middle"');
  out += text(18, top + plotH / 2, "Gaz na model", 'class="axis" transform="rotate(-90 18 ' + (top + plotH / 2) + ')" text-anchor="middle"');
  return `${out}</svg>`;
}

await writeFile(new URL("online-time-by-profile.svg", figures), onlineChart(), "utf8");
await writeFile(new URL("gas-per-model-by-batch.svg", figures), gasChart(), "utf8");
console.log("Saved two benchmark SVG plots.");
