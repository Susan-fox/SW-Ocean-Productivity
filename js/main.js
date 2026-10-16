
/*
 * Ocean Productivity Explorer
 * Interactive Map + EDA Explorer
 * D3.js v7
 */

const DATA_URL = "data/ocean_observations.csv";
const WORLD_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

let observations = [];
let worldLand = null;

let activeMetric = "GPP";
let selectedYear = "all";
let maximumDepth = 10000;

let edaMetric = "GPP";
let edaTransform = "raw";

const formatNumber = d3.format(",.3f");

function formatValue(value) {
  return Number.isFinite(value)
    ? formatNumber(value)
    : "N/A";
}

function prepareData(rows) {
  return rows.map((d, index) => ({
    id: index + 1,
    Date: d.Date,
    Lat: +d.Lat,
    Lon: +d.Lon,
    Depth: +d.Depth,
    GPP: +d.GPP,
    CR: +d.CR,
    NCP: +d.NCP,
    Year: d.Date.slice(0, 4)
  })).filter(d =>
    Number.isFinite(d.Lat) &&
    Number.isFinite(d.Lon) &&
    d.Lat >= -90 &&
    d.Lat <= 90 &&
    d.Lon >= -180 &&
    d.Lon <= 180
  );
}

function addStyles() {
  const style = document.createElement("style");

  style.textContent = `
    #ocean-map,
    #data-explorer {
      padding: 20px;
      min-height: 300px;
      background: #f8fcfe;
      border: 1px solid #d9e5ed;
      border-radius: 12px;
    }

    .map-controls,
    .eda-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 20px;
    }

    .control-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .control-group label {
      font-size: 13px;
      font-weight: 600;
      color: #164b70;
    }

    .control-group select {
      padding: 9px 12px;
      background: white;
      border: 1px solid #bfd5e0;
      border-radius: 7px;
      color: #233747;
    }

    .stat-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 18px;
    }

    .stat-card {
      background: #eaf4f8;
      border-radius: 9px;
      padding: 12px 16px;
      min-width: 130px;
    }

    .stat-card span {
      display: block;
      font-size: 12px;
      color: #637989;
    }

    .stat-card strong {
      display: block;
      color: #164b70;
      font-size: 20px;
      margin-top: 3px;
    }

    .map-canvas,
    .chart-canvas {
      position: relative;
      width: 100%;
    }

    .map-canvas svg,
    .chart-canvas svg {
      display: block;
      width: 100%;
      height: auto;
    }

    .observation-point {
      cursor: pointer;
    }

    .observation-point:hover {
      stroke: #102b46;
      stroke-width: 2;
    }

    .viz-tooltip {
      position: absolute;
      pointer-events: none;
      z-index: 50;
      opacity: 0;
      background: rgba(16,43,70,.96);
      color: white;
      padding: 12px 15px;
      border-radius: 9px;
      font-size: 12px;
      line-height: 1.7;
      box-shadow: 0 5px 18px rgba(0,0,0,.18);
      max-width: 260px;
    }

    .map-legend {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
      font-size: 12px;
      color: #637989;
    }

    .legend-gradient {
      width: 180px;
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(
        to right,
        #d7191c,
        #ffffbf,
        #2b83ba
      );
    }

    .viz-note {
      font-size: 12px;
      color: #637989;
      margin-top: 15px;
    }

    .axis text {
      fill: #637989;
      font-size: 12px;
    }

    .axis path,
    .axis line {
      stroke: #cadce6;
    }

    .histogram-bar {
      fill: #247ca3;
      stroke: #ffffff;
      stroke-width: 1;
    }

    .histogram-bar:hover {
      fill: #39a8b5;
    }

    .eda-explanation {
      margin-top: 20px;
      padding: 16px;
      background: #eaf4f8;
      border-left: 4px solid #39a8b5;
      border-radius: 8px;
      color: #164b70;
      font-size: 14px;
    }

    .viz-error {
      color: #a12727;
      padding: 20px;
    }

    @media (max-width: 700px) {
      #ocean-map,
      #data-explorer {
        padding: 12px;
      }

      .stat-card {
        min-width: 110px;
      }
    }
  `;

  document.head.appendChild(style);
}

function showTooltip(event, selector, html) {
  const tooltip = d3.select(selector);
  const parent = tooltip.node().parentElement;
  const rect = parent.getBoundingClientRect();

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  tooltip
    .html(html)
    .style("opacity", 1)
    .style(
      "left",
      `${Math.max(0, Math.min(x + 12, rect.width - 245))}px`
    )
    .style("top", `${Math.max(0, y - 30)}px`);
}

function hideTooltip(selector) {
  d3.select(selector).style("opacity", 0);
}

/* =====================================
   MAP
   ===================================== */

function createMapInterface() {
  const container = d3.select("#ocean-map");

  container.html(`
    <div class="map-controls">
      <div class="control-group">
        <label for="metric-select">Variable</label>
        <select id="metric-select">
          <option value="GPP">GPP</option>
          <option value="CR">CR</option>
          <option value="NCP">NCP</option>
        </select>
      </div>

      <div class="control-group">
        <label for="year-select">Sampling Year</label>
        <select id="year-select">
          <option value="all">All years</option>
        </select>
      </div>

      <div class="control-group">
        <label for="depth-select">Maximum Depth</label>
        <select id="depth-select">
          <option value="10000">All depths</option>
          <option value="10">0–10 m</option>
          <option value="50">0–50 m</option>
          <option value="100">0–100 m</option>
          <option value="200">0–200 m</option>
        </select>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <span>Visible observations</span>
        <strong id="visible-count">0</strong>
      </div>
      <div class="stat-card">
        <span>Selected variable</span>
        <strong id="selected-variable">GPP</strong>
      </div>
    </div>

    <div class="map-canvas" id="map-canvas">
      <div class="viz-tooltip" id="map-tooltip"></div>
    </div>

    <div class="map-legend" id="map-legend"></div>

    <p class="viz-note">
      Colors represent the selected variable.
      Hover over a sampling point to inspect its values.
      Multiple observations may overlap.
    </p>
  `);

  const years = [...new Set(
    observations.map(d => d.Year)
  )].sort();

  d3.select("#year-select")
    .selectAll("option.year-option")
    .data(years)
    .join("option")
    .attr("class", "year-option")
    .attr("value", d => d)
    .text(d => d);

  d3.select("#metric-select").on("change", function () {
    activeMetric = this.value;
    updateMap();
  });

  d3.select("#year-select").on("change", function () {
    selectedYear = this.value;
    updateMap();
  });

  d3.select("#depth-select").on("change", function () {
    maximumDepth = +this.value;
    updateMap();
  });
}

function filteredObservations() {
  return observations.filter(d =>
    (selectedYear === "all" || d.Year === selectedYear) &&
    d.Depth <= maximumDepth
  );
}

function updateMap() {
  const data = filteredObservations();

  d3.select("#visible-count").text(data.length);
  d3.select("#selected-variable").text(activeMetric);

  const width = 960;
  const height = 500;

  const projection = d3.geoNaturalEarth1()
    .fitExtent(
      [[15, 15], [width - 15, height - 15]],
      { type: "Sphere" }
    );

  const path = d3.geoPath(projection);
  const canvas = d3.select("#map-canvas");

  canvas.selectAll("svg").remove();

  const svg = canvas.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "World map of marine observations");

  svg.append("path")
    .datum({ type: "Sphere" })
    .attr("d", path)
    .attr("fill", "#e8f4f8");

  svg.append("path")
    .datum(d3.geoGraticule10())
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", "#d1e2e9")
    .attr("stroke-width", 0.7);

  if (worldLand) {
    svg.append("path")
      .datum(worldLand)
      .attr("d", path)
      .attr("fill", "#d5e1e7")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 0.6);
  }

  const values = data
    .map(d => d[activeMetric])
    .filter(Number.isFinite);

  const minValue = d3.min(values) ?? 0;
  const maxValue = d3.max(values) ?? 1;

  const color = d3.scaleSequential()
    .domain([
      minValue,
      maxValue === minValue ? minValue + 1 : maxValue
    ])
    .interpolator(d3.interpolateRdYlBu)
    .clamp(true);

  svg.append("g")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("class", "observation-point")
    .attr("cx", d => projection([d.Lon, d.Lat])[0])
    .attr("cy", d => projection([d.Lon, d.Lat])[1])
    .attr("r", 3)
    .attr("fill", d => color(d[activeMetric]))
    .attr("fill-opacity", 0.75)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 0.3)
    .on("mousemove", (event, d) => {
      showTooltip(event, "#map-tooltip", `
        <strong>Observation ${d.id}</strong><br>
        Date: ${d.Date}<br>
        Latitude: ${formatValue(d.Lat)}°<br>
        Longitude: ${formatValue(d.Lon)}°<br>
        Depth: ${formatValue(d.Depth)} m<br>
        GPP: ${formatValue(d.GPP)}<br>
        CR: ${formatValue(d.CR)}<br>
        NCP: ${formatValue(d.NCP)}
      `);
    })
    .on("mouseleave", () => hideTooltip("#map-tooltip"));

  d3.select("#map-legend").html(`
    <span>${formatValue(minValue)}</span>
    <div class="legend-gradient"></div>
    <span>${formatValue(maxValue)}</span>
    <span>${activeMetric}</span>
  `);
}

/* =====================================
   EDA EXPLORER
   ===================================== */

function createEDAInterface() {
  const container = d3.select("#data-explorer");

  container.html(`
    <div class="eda-controls">
      <div class="control-group">
        <label for="eda-metric">Variable</label>
        <select id="eda-metric">
          <option value="GPP">GPP</option>
          <option value="CR">CR</option>
          <option value="NCP">NCP</option>
        </select>
      </div>

      <div class="control-group">
        <label for="eda-transform">Transformation</label>
        <select id="eda-transform">
          <option value="raw">Raw values</option>
          <option value="log">log1p(x)</option>
        </select>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <span>Observations</span>
        <strong id="eda-count">0</strong>
      </div>
      <div class="stat-card">
        <span>Mean</span>
        <strong id="eda-mean">—</strong>
      </div>
      <div class="stat-card">
        <span>Median</span>
        <strong id="eda-median">—</strong>
      </div>
      <div class="stat-card">
        <span>Maximum</span>
        <strong id="eda-max">—</strong>
      </div>
    </div>

    <div class="chart-canvas" id="eda-chart">
      <div class="viz-tooltip" id="eda-tooltip"></div>
    </div>

    <div class="eda-explanation" id="eda-explanation"></div>
  `);

  d3.select("#eda-metric").on("change", function () {
    edaMetric = this.value;

    if (edaMetric === "NCP") {
      edaTransform = "raw";
      d3.select("#eda-transform").property("value", "raw");
    }

    d3.select("#eda-transform")
      .select('option[value="log"]')
      .property("disabled", edaMetric === "NCP");

    updateEDA();
  });

  d3.select("#eda-transform").on("change", function () {
    edaTransform = this.value;
    updateEDA();
  });
}

function updateEDA() {
  const useLog = edaTransform === "log";

  const values = observations
    .map(d => d[edaMetric])
    .filter(Number.isFinite)
    .filter(d => !useLog || d >= 0)
    .map(d => useLog ? Math.log1p(d) : d);

  const mean = d3.mean(values);
  const median = d3.median(values);
  const maximum = d3.max(values);

  d3.select("#eda-count").text(values.length);
  d3.select("#eda-mean").text(formatValue(mean));
  d3.select("#eda-median").text(formatValue(median));
  d3.select("#eda-max").text(formatValue(maximum));

  const width = 900;
  const height = 420;

  const margin = {
    top: 30,
    right: 30,
    bottom: 65,
    left: 70
  };

  const canvas = d3.select("#eda-chart");
  canvas.selectAll("svg").remove();

  const svg = canvas.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", `Histogram of ${edaMetric}`);

  if (!values.length) {
    d3.select("#eda-explanation")
      .text("No valid observations available.");
    return;
  }

  const extent = d3.extent(values);

  const x = d3.scaleLinear()
    .domain(extent[0] === extent[1]
      ? [extent[0] - 0.5, extent[1] + 0.5]
      : extent)
    .nice()
    .range([margin.left, width - margin.right]);

  const histogram = d3.bin()
    .domain(x.domain())
    .thresholds(x.ticks(35));

  const bins = histogram(values);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("class", "axis")
    .attr(
      "transform",
      `translate(0,${height - margin.bottom})`
    )
    .call(d3.axisBottom(x).ticks(8));

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6));

  svg.append("g")
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("class", "histogram-bar")
    .attr("x", d => x(d.x0) + 1)
    .attr("y", d => y(d.length))
    .attr("width", d =>
      Math.max(0, x(d.x1) - x(d.x0) - 2)
    )
    .attr("height", d =>
      y(0) - y(d.length)
    )
    .on("mousemove", (event, d) => {
      showTooltip(event, "#eda-tooltip", `
        <strong>${edaMetric} Distribution</strong><br>
        Range: ${formatValue(d.x0)}
        to ${formatValue(d.x1)}<br>
        Observations: ${d.length}
      `);
    })
    .on("mouseleave", () => hideTooltip("#eda-tooltip"));

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 15)
    .attr("text-anchor", "middle")
    .attr("fill", "#164b70")
    .text(
      useLog
        ? `log1p(${edaMetric})`
        : `${edaMetric} (raw values)`
    );

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("fill", "#164b70")
    .text("Number of observations");

  const explanation = useLog
    ? `
      <strong>Log transformation:</strong>
      log1p(x) = ln(1 + x) compresses large values
      while retaining observations equal to zero.
      This can make right-skewed distributions
      easier to inspect.
    `
    : edaMetric === "NCP"
    ? `
      <strong>NCP distribution:</strong>
      Net Community Production can be positive,
      zero, or negative. Negative observations
      are meaningful, so the log1p option is
      disabled for NCP in this explorer.
    `
    : `
      <strong>Raw distribution:</strong>
      Large observations may create a long
      right tail. Switch to log1p to examine
      how the distribution changes.
    `;

  d3.select("#eda-explanation").html(explanation);
}

/* =====================================
   INITIALIZATION
   ===================================== */

async function initializeDashboard() {
  addStyles();

  try {
    const [rows, world] = await Promise.all([
      d3.csv(DATA_URL),
      d3.json(WORLD_URL).catch(() => null)
    ]);

    observations = prepareData(rows);

    if (world && typeof topojson !== "undefined") {
      worldLand = topojson.feature(
        world,
        world.objects.land
      );
    }

    createMapInterface();
    updateMap();

    createEDAInterface();
    updateEDA();

    console.log(
      `Dashboard loaded: ${observations.length} observations`
    );

  } catch (error) {
    console.error("Dashboard loading failed:", error);

    d3.select("#ocean-map").html(
      '<p class="viz-error">Unable to load ocean data.</p>'
    );

    d3.select("#data-explorer").html(
      '<p class="viz-error">Unable to load ocean data.</p>'
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initializeDashboard
);
