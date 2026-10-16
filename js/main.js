
const DATA_URL = "data/ocean_observations.csv";
const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const MODEL_FILES = {
  metrics: "data/baseline_metrics.csv",
  predictions: "data/baseline_predictions.csv",
  importance: "data/baseline_feature_importance.csv"
};

const COLORS = {
  navy: "#102b46",
  blue: "#247ca3",
  aqua: "#39a8b5",
  ocean: "#e8f4f8",
  land: "#d5e1e7",
  grid: "#d1e2e9",
  muted: "#637989",
  orange: "#e07a36"
};

let observations = [];
let worldLand = null;
let mapMetric = "GPP";
let mapYear = "all";
let mapDepth = Infinity;
let edaMetric = "GPP";
let edaTransform = "raw";
let modelTarget = "GPP";
let modelMetrics = [];
let modelPredictions = [];
let modelImportance = [];

const fmt = d3.format(",.3f");

function numberText(value) {
  return Number.isFinite(value) ? fmt(value) : "N/A";
}

function addDashboardStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #ocean-map, #data-explorer, #model-results {
      padding: 22px;
      min-height: 280px;
      background: #f8fcfe;
      border: 1px solid #d9e5ed;
      border-radius: 12px;
    }
    .viz-controls, .viz-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-bottom: 20px;
    }
    .viz-control {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .viz-control label {
      color: #164b70;
      font-size: 13px;
      font-weight: 600;
    }
    .viz-control select {
      padding: 9px 12px;
      border: 1px solid #bfd5e0;
      border-radius: 7px;
      background: white;
      color: #233747;
    }
    .viz-stat {
      flex: 1;
      min-width: 130px;
      background: #eaf4f8;
      border-radius: 9px;
      padding: 12px 16px;
    }
    .viz-stat span {
      display: block;
      color: #637989;
      font-size: 12px;
    }
    .viz-stat strong {
      display: block;
      color: #164b70;
      font-size: 21px;
      margin-top: 5px;
    }
    .viz-canvas {
      position: relative;
      width: 100%;
    }
    .viz-canvas svg, .validation-chart svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .viz-tooltip {
      position: absolute;
      pointer-events: none;
      opacity: 0;
      z-index: 50;
      background: rgba(16,43,70,.96);
      color: white;
      padding: 12px 15px;
      border-radius: 9px;
      font-size: 12px;
      line-height: 1.7;
      max-width: 250px;
    }
    .viz-axis text {
      fill: #637989;
      font-size: 12px;
    }
    .viz-axis path, .viz-axis line {
      stroke: #cadce6;
    }
    .viz-legend {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
      color: #637989;
      font-size: 12px;
    }
    .viz-gradient {
      width: 180px;
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(to right,#d7191c,#ffffbf,#2b83ba);
    }
    .viz-note {
      margin-top: 15px;
      color: #637989;
      font-size: 12px;
      line-height: 1.7;
    }
    .viz-explanation {
      background: #eaf4f8;
      border-left: 4px solid #39a8b5;
      padding: 15px;
      border-radius: 8px;
      color: #164b70;
      font-size: 14px;
      line-height: 1.7;
      margin-top: 20px;
    }
    .model-chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit,minmax(min(100%,350px),1fr));
      gap: 22px;
      margin-top: 22px;
    }
    .model-chart-card {
      min-width: 0;
      background: white;
      border: 1px solid #d9e5ed;
      border-radius: 12px;
      padding: 18px;
    }
    .model-chart-card h3 {
      margin: 0 0 8px;
      color: #164b70;
      font-size: 17px;
    }
    .model-chart-card p {
      font-size: 12px;
      color: #637989;
      line-height: 1.6;
    }
    .validation-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #d9e5ed;
    }
    .validation-section h3 {
      color: #164b70;
    }
    .validation-caption {
      color: #637989;
      font-size: 12px;
      line-height: 1.7;
    }
    .viz-error {
      color: #a12727;
      padding: 15px;
    }
    @media(max-width:700px) {
      #ocean-map,#data-explorer,#model-results {
        padding: 12px;
      }
    }
  `;
  document.head.appendChild(style);
}

function tooltipMove(event, selector, html) {
  const tip = d3.select(selector);
  const parent = tip.node().parentElement;
  const rect = parent.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  tip.html(html)
    .style("opacity", 1)
    .style("left", `${Math.max(0, Math.min(x + 12, rect.width - 245))}px`)
    .style("top", `${Math.max(0, y - 30)}px`);
}

function tooltipHide(selector) {
  d3.select(selector).style("opacity", 0);
}

function parseRows(rows) {
  return rows.map((d, i) => ({
    id: i + 1,
    Date: d.Date,
    Lat: Number(d.Lat),
    Lon: Number(d.Lon),
    Depth: Number(d.Depth),
    GPP: Number(d.GPP),
    CR: Number(d.CR),
    NCP: Number(d.NCP),
    Year: String(d.Date).slice(0, 4)
  })).filter(d =>
    Number.isFinite(d.Lat) &&
    Number.isFinite(d.Lon) &&
    d.Lat >= -90 && d.Lat <= 90 &&
    d.Lon >= -180 && d.Lon <= 180
  );
}

// ==================================================
// 1. INTERACTIVE OCEAN MAP
// ==================================================

function createMap() {
  d3.select("#ocean-map").html(`
    <div class="viz-controls">
      <div class="viz-control">
        <label>Variable</label>
        <select id="metric-select">
          <option value="GPP">GPP</option>
          <option value="CR">CR</option>
          <option value="NCP">NCP</option>
        </select>
      </div>
      <div class="viz-control">
        <label>Sampling Year</label>
        <select id="year-select">
          <option value="all">All years</option>
        </select>
      </div>
      <div class="viz-control">
        <label>Maximum Depth</label>
        <select id="depth-select">
          <option value="all">All depths</option>
          <option value="10">0–10 m</option>
          <option value="50">0–50 m</option>
          <option value="100">0–100 m</option>
          <option value="200">0–200 m</option>
        </select>
      </div>
    </div>
    <div class="viz-stats">
      <div class="viz-stat">
        <span>Visible observations</span>
        <strong id="visible-count">0</strong>
      </div>
      <div class="viz-stat">
        <span>Selected variable</span>
        <strong id="selected-variable">GPP</strong>
      </div>
    </div>
    <div class="viz-canvas" id="map-canvas">
      <div class="viz-tooltip" id="map-tooltip"></div>
    </div>
    <div class="viz-legend" id="map-legend"></div>
    <p class="viz-note">
      Colors represent the selected variable. Overlapping
      points may indicate observations at different depths
      or dates at the same location.
    </p>
  `);

  const years = [...new Set(observations.map(d => d.Year))].sort();

  d3.select("#year-select")
    .selectAll("option.year-option")
    .data(years)
    .join("option")
    .attr("class", "year-option")
    .attr("value", d => d)
    .text(d => d);

  d3.select("#metric-select").on("change", function () {
    mapMetric = this.value;
    updateMap();
  });

  d3.select("#year-select").on("change", function () {
    mapYear = this.value;
    updateMap();
  });

  d3.select("#depth-select").on("change", function () {
    mapDepth = this.value === "all" ? Infinity : Number(this.value);
    updateMap();
  });

  updateMap();
}

function updateMap() {
  const data = observations.filter(d =>
    (mapYear === "all" || d.Year === mapYear) &&
    d.Depth <= mapDepth
  );

  d3.select("#visible-count").text(data.length);
  d3.select("#selected-variable").text(mapMetric);

  const width = 960, height = 500;
  const projection = d3.geoNaturalEarth1().fitExtent(
    [[15, 15], [width - 15, height - 15]],
    { type: "Sphere" }
  );
  const path = d3.geoPath(projection);

  const canvas = d3.select("#map-canvas");
  canvas.selectAll("svg").remove();

  const svg = canvas.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  svg.append("path")
    .datum({ type: "Sphere" })
    .attr("d", path)
    .attr("fill", COLORS.ocean);

  svg.append("path")
    .datum(d3.geoGraticule10())
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", COLORS.grid)
    .attr("stroke-width", 0.7);

  if (worldLand) {
    svg.append("path")
      .datum(worldLand)
      .attr("d", path)
      .attr("fill", COLORS.land)
      .attr("stroke", "white")
      .attr("stroke-width", 0.6);
  }

  const values = data.map(d => d[mapMetric]).filter(Number.isFinite);
  const min = d3.min(values) ?? 0;
  const max = d3.max(values) ?? 1;

  const color = d3.scaleSequential()
    .domain([min, max === min ? min + 1 : max])
    .interpolator(d3.interpolateRdYlBu)
    .clamp(true);

  svg.append("g")
    .selectAll("circle")
    .data(data.filter(d => Number.isFinite(d[mapMetric])))
    .join("circle")
    .attr("cx", d => projection([d.Lon, d.Lat])[0])
    .attr("cy", d => projection([d.Lon, d.Lat])[1])
    .attr("r", 3)
    .attr("fill", d => color(d[mapMetric]))
    .attr("fill-opacity", 0.75)
    .attr("stroke", "white")
    .attr("stroke-width", 0.3)
    .style("cursor", "pointer")
    .on("mousemove", (event, d) => {
      tooltipMove(event, "#map-tooltip", `
        <strong>Observation ${d.id}</strong><br>
        Date: ${d.Date}<br>
        Latitude: ${numberText(d.Lat)}°<br>
        Longitude: ${numberText(d.Lon)}°<br>
        Depth: ${numberText(d.Depth)} m<br>
        GPP: ${numberText(d.GPP)}<br>
        CR: ${numberText(d.CR)}<br>
        NCP: ${numberText(d.NCP)}
      `);
    })
    .on("mouseleave", () => tooltipHide("#map-tooltip"));

  d3.select("#map-legend").html(`
    <span>${numberText(min)}</span>
    <div class="viz-gradient"></div>
    <span>${numberText(max)}</span>
    <span>${mapMetric}</span>
  `);
}

// ==================================================
// 2. EXPLORATORY DATA ANALYSIS
// ==================================================

function createEDA() {
  d3.select("#data-explorer").html(`
    <div class="viz-controls">
      <div class="viz-control">
        <label>Variable</label>
        <select id="eda-metric">
          <option value="GPP">GPP</option>
          <option value="CR">CR</option>
          <option value="NCP">NCP</option>
        </select>
      </div>
      <div class="viz-control">
        <label>Transformation</label>
        <select id="eda-transform">
          <option value="raw">Raw values</option>
          <option value="log">log1p(x)</option>
        </select>
      </div>
    </div>
    <div class="viz-stats">
      <div class="viz-stat">
        <span>Observations</span><strong id="eda-count">0</strong>
      </div>
      <div class="viz-stat">
        <span>Mean</span><strong id="eda-mean">—</strong>
      </div>
      <div class="viz-stat">
        <span>Median</span><strong id="eda-median">—</strong>
      </div>
      <div class="viz-stat">
        <span>Maximum</span><strong id="eda-max">—</strong>
      </div>
    </div>
    <div class="viz-canvas" id="eda-chart">
      <div class="viz-tooltip" id="eda-tooltip"></div>
    </div>
    <div class="viz-explanation" id="eda-explanation"></div>
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

  updateEDA();
}

function updateEDA() {
  const useLog = edaTransform === "log";

  const values = observations
    .map(d => d[edaMetric])
    .filter(Number.isFinite)
    .filter(d => !useLog || d >= 0)
    .map(d => useLog ? Math.log1p(d) : d);

  d3.select("#eda-count").text(values.length);
  d3.select("#eda-mean").text(numberText(d3.mean(values)));
  d3.select("#eda-median").text(numberText(d3.median(values)));
  d3.select("#eda-max").text(numberText(d3.max(values)));

  const width = 900, height = 420;
  const margin = { top: 30, right: 30, bottom: 65, left: 70 };

  const canvas = d3.select("#eda-chart");
  canvas.selectAll("svg").remove();

  const svg = canvas.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  if (!values.length) return;

  const extent = d3.extent(values);

  const x = d3.scaleLinear()
    .domain(extent[0] === extent[1]
      ? [extent[0] - 0.5, extent[1] + 0.5]
      : extent)
    .nice()
    .range([margin.left, width - margin.right]);

  const bins = d3.bin()
    .domain(x.domain())
    .thresholds(x.ticks(35))(values);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("class", "viz-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(8));

  svg.append("g")
    .attr("class", "viz-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6));

  svg.append("g")
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", d => x(d.x0) + 1)
    .attr("y", d => y(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 2))
    .attr("height", d => y(0) - y(d.length))
    .attr("fill", COLORS.blue)
    .attr("stroke", "white")
    .on("mousemove", (event, d) => {
      tooltipMove(event, "#eda-tooltip", `
        <strong>${edaMetric}</strong><br>
        Range: ${numberText(d.x0)} to ${numberText(d.x1)}<br>
        Count: ${d.length}
      `);
    })
    .on("mouseleave", () => tooltipHide("#eda-tooltip"));

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 15)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.navy)
    .text(useLog ? `log1p(${edaMetric})` : `${edaMetric} (raw values)`);

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.navy)
    .text("Number of observations");

  const explanation = useLog
    ? "log1p(x) = ln(1 + x) compresses large values while retaining zeros. Statistics above are on the transformed scale."
    : edaMetric === "NCP"
      ? "NCP can be negative, so only its raw distribution is displayed."
      : "Raw observations may be strongly right-skewed. Switch to log1p to examine a compressed distribution.";

  d3.select("#eda-explanation").text(explanation);
}

// ==================================================
// 3. RANDOM FOREST BASELINE RESULTS
// ==================================================

function createModels() {
  d3.select("#model-results").html(`
    <div class="viz-controls">
      <div class="viz-control">
        <label>Prediction Target</label>
        <select id="model-target">
          <option value="GPP">GPP</option>
          <option value="CR">CR</option>
        </select>
      </div>
    </div>

    <div class="viz-stats">
      <div class="viz-stat">
        <span>Test R² (log1p scale)</span>
        <strong id="model-r2">—</strong>
      </div>
      <div class="viz-stat">
        <span>Test RMSE (log1p scale)</span>
        <strong id="model-rmse">—</strong>
      </div>
      <div class="viz-stat">
        <span>Training samples</span>
        <strong id="model-train">—</strong>
      </div>
      <div class="viz-stat">
        <span>Testing samples</span>
        <strong id="model-test">—</strong>
      </div>
    </div>

    <div class="model-chart-grid">
      <div class="model-chart-card">
        <h3>Actual vs Predicted</h3>
        <p>Test observations on the log1p scale.
        Dashed line represents perfect prediction.</p>
        <div class="viz-canvas" id="prediction-chart">
          <div class="viz-tooltip" id="prediction-tooltip"></div>
        </div>
      </div>

      <div class="model-chart-card">
        <h3>Feature Importance</h3>
        <p>Random Forest impurity-based importance.
        These values do not establish causality.</p>
        <div class="viz-canvas" id="importance-chart">
          <div class="viz-tooltip" id="importance-tooltip"></div>
        </div>
      </div>
    </div>

    <div class="viz-explanation">
      <strong>Baseline setup:</strong>
      Random Forest regression with 200 trees.
      Predictors: latitude, longitude, depth, year, and month.
      Targets: log1p(GPP) and log1p(CR).
      Random 80/20 train-test split, seed 42.
      Dataset: 3,173 observations after duplicate removal.
      These results are preliminary.
    </div>

    <div class="validation-section">
      <h3>Temporal Validation: Generalization Across Years</h3>
      <p class="validation-caption">
        The baseline is additionally evaluated on entirely
        held-out years to assess its ability to generalize
        beyond randomly selected observations.
        The results below were obtained in Jupyter.
      </p>

      <div class="viz-stats">
        <div class="viz-stat">
          <span>GPP Mean R² · 10 year splits</span>
          <strong>0.265</strong>
        </div>
        <div class="viz-stat">
          <span>CR Mean R² · 10 year splits</span>
          <strong>0.013</strong>
        </div>
        <div class="viz-stat">
          <span>GPP Mean RMSE · log1p</span>
          <strong>0.660</strong>
        </div>
        <div class="viz-stat">
          <span>CR Mean RMSE · log1p</span>
          <strong>0.514</strong>
        </div>
      </div>

      <div class="model-chart-grid">
        <div class="model-chart-card">
          <h3>Random Split vs. Held-out Years</h3>
          <p>Comparison of test R² under two evaluation methods.</p>
          <div class="validation-chart" id="validation-comparison-chart"></div>
        </div>
        <div class="model-chart-card">
          <h3>10 Repeated Year-based Splits</h3>
          <p>Variation in R² across different held-out-year combinations.</p>
          <div class="validation-chart" id="validation-repeated-chart"></div>
        </div>
      </div>

      <div class="viz-explanation">
        <strong>Key finding:</strong>
        Model performance decreases substantially when
        entire years are withheld from training.
        GPP retains limited predictive skill, while CR
        generalization is weak and unstable.
        This suggests that random row splitting may
        overestimate performance on unseen years.
        Additional environmental predictors, including
        satellite chlorophyll-a and sea surface temperature,
        are planned for future experiments.
      </div>

      <p class="validation-caption">
        The single held-out-year test used 1985, 1997, 1998,
        2000, 2002, and 2010 as test years (662 observations).
        Repeated validation used ten different year-group splits.
        Negative R² means predictions were worse than predicting
        the test-set mean.
      </p>
    </div>
  `);

  d3.select("#model-target").on("change", function () {
    modelTarget = this.value;
    updateModels();
  });

  updateModels();
  drawTemporalValidation();
}

function updateModels() {
  const metrics = modelMetrics.find(d => d.target === modelTarget);
  if (!metrics) return;

  d3.select("#model-r2").text(numberText(metrics.r2));
  d3.select("#model-rmse").text(numberText(metrics.rmse_log1p));
  d3.select("#model-train").text(metrics.train_n);
  d3.select("#model-test").text(metrics.test_n);

  drawPredictionChart();
  drawImportanceChart();
}

function drawPredictionChart() {
  const data = modelPredictions.filter(d =>
    d.target === modelTarget &&
    Number.isFinite(d.actual_log1p) &&
    Number.isFinite(d.predicted_log1p)
  );

  const width = 480, height = 440;
  const margin = { top: 25, right: 20, bottom: 65, left: 65 };
  const canvas = d3.select("#prediction-chart");

  canvas.selectAll("svg").remove();

  const svg = canvas.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  if (!data.length) return;

  const max = d3.max(data, d =>
    Math.max(d.actual_log1p, d.predicted_log1p)
  ) || 1;

  const x = d3.scaleLinear()
    .domain([0, max]).nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain(x.domain())
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("class", "viz-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6));

  svg.append("g")
    .attr("class", "viz-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6));

  svg.append("line")
    .attr("x1", x(0))
    .attr("y1", y(0))
    .attr("x2", x(x.domain()[1]))
    .attr("y2", y(x.domain()[1]))
    .attr("stroke", COLORS.orange)
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6,5");

  svg.append("g")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", d => x(d.actual_log1p))
    .attr("cy", d => y(d.predicted_log1p))
    .attr("r", 3.5)
    .attr("fill", COLORS.blue)
    .attr("fill-opacity", 0.45)
    .on("mousemove", (event, d) => {
      tooltipMove(event, "#prediction-tooltip", `
        <strong>${modelTarget} prediction</strong><br>
        Date: ${d.Date}<br>
        Actual log1p: ${numberText(d.actual_log1p)}<br>
        Predicted log1p: ${numberText(d.predicted_log1p)}<br>
        Actual raw: ${numberText(d.actual_raw)}<br>
        Predicted raw: ${numberText(d.predicted_raw)}
      `);
    })
    .on("mouseleave", () => tooltipHide("#prediction-tooltip"));

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 15)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.navy)
    .text(`Actual log1p(${modelTarget})`);

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 17)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.navy)
    .text(`Predicted log1p(${modelTarget})`);
}

function drawImportanceChart() {
  const data = modelImportance
    .filter(d => d.target === modelTarget)
    .sort((a, b) => b.importance - a.importance);

  const width = 480, height = 360;
  const margin = { top: 25, right: 30, bottom: 55, left: 85 };

  const canvas = d3.select("#importance-chart");
  canvas.selectAll("svg").remove();

  const svg = canvas.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`);

  if (!data.length) return;

  const x = d3.scaleLinear()
    .domain([0, (d3.max(data, d => d.importance) || 1) * 1.1])
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.feature))
    .range([margin.top, height - margin.bottom])
    .padding(0.25);

  svg.append("g")
    .attr("class", "viz-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  svg.append("g")
    .attr("class", "viz-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5));

  svg.append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", x(0))
    .attr("y", d => y(d.feature))
    .attr("width", d => x(d.importance) - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", COLORS.aqua)
    .on("mousemove", (event, d) => {
      tooltipMove(event, "#importance-tooltip", `
        <strong>${d.feature}</strong><br>
        Importance: ${numberText(d.importance)}
      `);
    })
    .on("mouseleave", () => tooltipHide("#importance-tooltip"));

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 12)
    .attr("text-anchor", "middle")
    .attr("fill", COLORS.navy)
    .text("Impurity-based feature importance");
}

// ==================================================
// 4. TEMPORAL VALIDATION
// Results from SW_Year_Based_Validation.ipynb
// ==================================================

function drawTemporalValidation() {
  const comparison = [
    { target: "GPP", random: 0.771, years: 0.355 },
    { target: "CR", random: 0.629, years: 0.029 }
  ];

  const repeated = [
    { split: 1, GPP: 0.355, CR: 0.029 },
    { split: 2, GPP: 0.051, CR: -0.356 },
    { split: 3, GPP: 0.263, CR: -0.226 },
    { split: 4, GPP: 0.254, CR: -0.290 },
    { split: 5, GPP: 0.255, CR: 0.122 },
    { split: 6, GPP: 0.207, CR: 0.145 },
    { split: 7, GPP: 0.383, CR: 0.315 },
    { split: 8, GPP: 0.194, CR: 0.005 },
    { split: 9, GPP: 0.351, CR: 0.074 },
    { split: 10, GPP: 0.339, CR: 0.315 }
  ];

  // Chart A: Random split vs held-out years
  {
    const width = 520, height = 370;
    const margin = { top: 42, right: 20, bottom: 65, left: 62 };

    const svg = d3.select("#validation-comparison-chart")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`);

    const x0 = d3.scaleBand()
      .domain(comparison.map(d => d.target))
      .range([margin.left, width - margin.right])
      .padding(0.38);

    const x1 = d3.scaleBand()
      .domain(["random", "years"])
      .range([0, x0.bandwidth()])
      .padding(0.08);

    const y = d3.scaleLinear()
      .domain([0, 0.85])
      .range([height - margin.bottom, margin.top]);

    svg.append("g")
      .attr("class", "viz-axis")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x0));

    svg.append("g")
      .attr("class", "viz-axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5));

    comparison.forEach(d => {
      ["random", "years"].forEach(key => {
        svg.append("rect")
          .attr("x", x0(d.target) + x1(key))
          .attr("y", y(d[key]))
          .attr("width", x1.bandwidth())
          .attr("height", y(0) - y(d[key]))
          .attr("fill", key === "random" ? COLORS.blue : COLORS.orange);

        svg.append("text")
          .attr("x", x0(d.target) + x1(key) + x1.bandwidth() / 2)
          .attr("y", y(d[key]) - 7)
          .attr("text-anchor", "middle")
          .attr("font-size", 13)
          .attr("fill", COLORS.navy)
          .text(d3.format(".3f")(d[key]));
      });
    });

    const legend = svg.append("g")
      .attr("transform", "translate(65,14)");

    [
      ["Random rows", COLORS.blue],
      ["Held-out years", COLORS.orange]
    ].forEach((entry, i) => {
      const g = legend.append("g")
        .attr("transform", `translate(${i * 175},0)`);

      g.append("rect")
        .attr("width", 13)
        .attr("height", 13)
        .attr("fill", entry[1]);

      g.append("text")
        .attr("x", 19)
        .attr("y", 11)
        .attr("font-size", 12)
        .attr("fill", COLORS.navy)
        .text(entry[0]);
    });
  }

  // Chart B: Ten repeated held-out-year splits
  {
    const width = 520, height = 370;
    const margin = { top: 42, right: 22, bottom: 65, left: 62 };

    const svg = d3.select("#validation-repeated-chart")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`);

    const x = d3.scaleLinear()
      .domain([1, 10])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([-0.4, 0.45])
      .range([height - margin.bottom, margin.top]);

    svg.append("g")
      .attr("class", "viz-axis")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(10).tickFormat(d3.format("d")));

    svg.append("g")
      .attr("class", "viz-axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(7));

    svg.append("line")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", "#7b8790")
      .attr("stroke-dasharray", "5,5");

    [
      ["GPP", COLORS.blue],
      ["CR", COLORS.orange]
    ].forEach(([target, color]) => {
      const line = d3.line()
        .x(d => x(d.split))
        .y(d => y(d[target]));

      svg.append("path")
        .datum(repeated)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2.5);

      svg.append("g")
        .selectAll("circle")
        .data(repeated)
        .join("circle")
        .attr("cx", d => x(d.split))
        .attr("cy", d => y(d[target]))
        .attr("r", 4)
        .attr("fill", color)
        .append("title")
        .text(d =>
          `Split ${d.split}, ${target}: R² = ${d[target].toFixed(3)}`
        );
    });

    const legend = svg.append("g")
      .attr("transform", "translate(65,14)");

    [
      ["GPP", COLORS.blue],
      ["CR", COLORS.orange]
    ].forEach((entry, i) => {
      const g = legend.append("g")
        .attr("transform", `translate(${i * 105},0)`);

      g.append("line")
        .attr("x2", 18)
        .attr("y1", 7)
        .attr("y2", 7)
        .attr("stroke", entry[1])
        .attr("stroke-width", 3);

      g.append("text")
        .attr("x", 24)
        .attr("y", 11)
        .attr("font-size", 12)
        .attr("fill", COLORS.navy)
        .text(entry[0]);
    });

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 15)
      .attr("text-anchor", "middle")
      .attr("fill", COLORS.navy)
      .text("Year-based split number");
  }
}

// ==================================================
// 5. INITIALIZATION
// ==================================================

async function initializeDashboard() {
  addDashboardStyles();

  try {
    const [rows, world] = await Promise.all([
      d3.csv(DATA_URL),
      d3.json(WORLD_URL).catch(() => null)
    ]);

    observations = parseRows(rows);

    if (world && typeof topojson !== "undefined") {
      worldLand = topojson.feature(world, world.objects.land);
    }

    createMap();
    createEDA();

    console.log(`Loaded ${observations.length} ocean observations`);
  } catch (error) {
    console.error("Observation data error:", error);

    d3.select("#ocean-map").html(
      '<p class="viz-error">Unable to load ocean observations.</p>'
    );

    d3.select("#data-explorer").html(
      '<p class="viz-error">Unable to load ocean observations.</p>'
    );
  }

  try {
    const [metrics, predictions, importance] = await Promise.all([
      d3.csv(MODEL_FILES.metrics),
      d3.csv(MODEL_FILES.predictions),
      d3.csv(MODEL_FILES.importance)
    ]);

    modelMetrics = metrics.map(d => ({
      target: d.target,
      r2: Number(d.r2),
      rmse_log1p: Number(d.rmse_log1p),
      train_n: Number(d.train_n),
      test_n: Number(d.test_n)
    }));

    modelPredictions = predictions.map(d => ({
      target: d.target,
      Date: d.Date,
      actual_log1p: Number(d.actual_log1p),
      predicted_log1p: Number(d.predicted_log1p),
      actual_raw: Number(d.actual_raw),
      predicted_raw: Number(d.predicted_raw)
    }));

    modelImportance = importance.map(d => ({
      target: d.target,
      feature: d.feature,
      importance: Number(d.importance)
    }));

    createModels();

    console.log("Model results and temporal validation loaded");
  } catch (error) {
    console.error("Model data error:", error);

    d3.select("#model-results").html(`
      <p class="viz-error">
        Unable to load baseline model CSV files.
        Please check the data folder.
      </p>
    `);
  }
}

document.addEventListener("DOMContentLoaded", initializeDashboard);
