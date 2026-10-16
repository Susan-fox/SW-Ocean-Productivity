
/*
 * Ocean Productivity Explorer
 * Interactive Ocean Observation Map
 * D3.js v7
 */

const DATA_URL = "data/ocean_observations.csv";
const WORLD_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const COLORS = {
  ocean: "#e8f4f8",
  land: "#d5e1e7",
  coastline: "#ffffff",
  grid: "#d1e2e9",
  low: "#2b83ba",
  mid: "#ffffbf",
  high: "#d7191c"
};

let observations = [];
let activeMetric = "GPP";
let selectedYear = "all";
let maximumDepth = 10000;
let worldLand = null;

const metricLabels = {
  GPP: "Gross Primary Production",
  CR: "Community Respiration",
  NCP: "Net Community Production"
};

function addMapStyles() {
  const style = document.createElement("style");

  style.textContent = `
    #ocean-map {
      min-height: 500px;
      padding: 20px;
      background: #f8fcfe;
      border: 1px solid #d9e5ed;
      border-radius: 12px;
    }

    .map-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
      align-items: end;
      margin-bottom: 18px;
    }

    .map-control {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .map-control label {
      font-size: 13px;
      font-weight: 600;
      color: #164b70;
    }

    .map-control select,
    .map-control input {
      padding: 9px 12px;
      border: 1px solid #bfd5e0;
      border-radius: 7px;
      background: white;
      color: #233747;
    }

    .map-statistics {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 14px;
    }

    .map-stat {
      padding: 10px 15px;
      border-radius: 8px;
      background: #eaf4f8;
      color: #164b70;
      font-size: 13px;
    }

    .map-stat strong {
      font-size: 17px;
    }

    .map-canvas {
      position: relative;
      width: 100%;
    }

    .map-canvas svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .observation-point {
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .observation-point:hover {
      stroke: #102b46;
      stroke-width: 1.8px;
    }

    .ocean-tooltip {
      position: absolute;
      pointer-events: none;
      z-index: 50;
      background: rgba(16, 43, 70, 0.96);
      color: white;
      padding: 12px 15px;
      border-radius: 9px;
      font-size: 12px;
      line-height: 1.7;
      max-width: 250px;
      box-shadow: 0 5px 18px rgba(0,0,0,0.18);
      opacity: 0;
    }

    .map-legend {
      margin-top: 14px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      color: #637989;
    }

    .legend-gradient {
      width: 190px;
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(
        to right,
        #2b83ba,
        #ffffbf,
        #d7191c
      );
    }

    .map-note {
      font-size: 12px;
      color: #637989;
      margin-top: 12px;
    }

    .map-error {
      color: #a12727;
      padding: 20px;
    }
  `;

  document.head.appendChild(style);
}

function createMapInterface() {
  const container = d3.select("#ocean-map");

  container.html(`
    <div class="map-controls">
      <div class="map-control">
        <label for="metric-select">Variable</label>
        <select id="metric-select">
          <option value="GPP">GPP</option>
          <option value="CR">CR</option>
          <option value="NCP">NCP</option>
        </select>
      </div>

      <div class="map-control">
        <label for="year-select">Sampling Year</label>
        <select id="year-select">
          <option value="all">All years</option>
        </select>
      </div>

      <div class="map-control">
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

    <div class="map-statistics">
      <div class="map-stat">
        Visible observations:
        <strong id="visible-count">0</strong>
      </div>
      <div class="map-stat">
        Selected variable:
        <strong id="selected-variable">GPP</strong>
      </div>
    </div>

    <div class="map-canvas" id="map-canvas">
      <div class="ocean-tooltip" id="map-tooltip"></div>
    </div>

    <div class="map-legend">
      <span>Lower value</span>
      <div class="legend-gradient"></div>
      <span>Higher value</span>
    </div>

    <p class="map-note">
      Colors are scaled using the visible observations.
      Hover over a point to inspect its measurements.
      Overlapping observations may share a location.
    </p>
  `);

  d3.select("#metric-select").on("change", function () {
    activeMetric = this.value;
    updateMap();
  });

  d3.select("#year-select").on("change", function () {
    selectedYear = this.value;
    updateMap();
  });

  d3.select("#depth-select").on("change", function () {
    maximumDepth = Number(this.value);
    updateMap();
  });
}

function prepareData(rows) {
  return rows.map((d, index) => ({
    id: index,
    Date: d.Date,
    Lat: Number(d.Lat),
    Lon: Number(d.Lon),
    Depth: Number(d.Depth),
    GPP: Number(d.GPP),
    CR: Number(d.CR),
    NCP: Number(d.NCP),
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

function populateYears() {
  const years = Array.from(
    new Set(observations.map(d => d.Year))
  ).sort();

  d3.select("#year-select")
    .selectAll("option.year-option")
    .data(years)
    .enter()
    .append("option")
    .attr("class", "year-option")
    .attr("value", d => d)
    .text(d => d);
}

function filteredObservations() {
  return observations.filter(d => {
    const yearMatch =
      selectedYear === "all" || d.Year === selectedYear;

    const depthMatch = d.Depth <= maximumDepth;

    return yearMatch && depthMatch;
  });
}

function formatValue(value) {
  return Number.isFinite(value)
    ? d3.format(".3f")(value)
    : "N/A";
}

function showTooltip(event, d) {
  const tooltip = d3.select("#map-tooltip");
  const canvas = document.getElementById("map-canvas");
  const rect = canvas.getBoundingClientRect();

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  tooltip
    .html(`
      <strong>Observation ${d.id + 1}</strong><br>
      Date: ${d.Date}<br>
      Latitude: ${formatValue(d.Lat)}°<br>
      Longitude: ${formatValue(d.Lon)}°<br>
      Depth: ${formatValue(d.Depth)} m<br>
      GPP: ${formatValue(d.GPP)}<br>
      CR: ${formatValue(d.CR)}<br>
      NCP: ${formatValue(d.NCP)}
    `)
    .style("opacity", 1)
    .style("left", `${Math.min(x + 14, rect.width - 245)}px`)
    .style("top", `${Math.max(0, y - 20)}px`);
}

function hideTooltip() {
  d3.select("#map-tooltip").style("opacity", 0);
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
    .attr("aria-label", "World map of ocean observations");

  svg.append("path")
    .datum({ type: "Sphere" })
    .attr("d", path)
    .attr("fill", COLORS.ocean);

  const graticule = d3.geoGraticule10();

  svg.append("path")
    .datum(graticule)
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", COLORS.grid)
    .attr("stroke-width", 0.7);

  if (worldLand) {
    svg.append("path")
      .datum(worldLand)
      .attr("d", path)
      .attr("fill", COLORS.land)
      .attr("stroke", COLORS.coastline)
      .attr("stroke-width", 0.6);
  }

  const values = data
    .map(d => d[activeMetric])
    .filter(Number.isFinite);

  const minValue = d3.min(values) ?? 0;
  const maxValue = d3.max(values) ?? 1;

  const color = d3.scaleSequential()
    .domain([minValue, maxValue === minValue
      ? minValue + 1
      : maxValue])
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
    .on("mousemove", showTooltip)
    .on("mouseleave", hideTooltip);

  d3.select(".map-legend").html(`
    <span>${formatValue(minValue)}</span>
    <div class="legend-gradient"
      style="background:linear-gradient(to right,
        #d7191c, #ffffbf, #2b83ba)">
    </div>
    <span>${formatValue(maxValue)}</span>
    <span>${activeMetric}</span>
  `);
}

async function initializeMap() {
  const mapContainer = document.getElementById("ocean-map");

  if (!mapContainer) return;

  addMapStyles();
  createMapInterface();

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

    populateYears();
    updateMap();

    console.log(
      `Ocean map loaded: ${observations.length} observations`
    );

  } catch (error) {
    console.error("Failed to load ocean data:", error);

    mapContainer.innerHTML = `
      <p class="map-error">
        Unable to load ocean observations.
        Please check that
        data/ocean_observations.csv
        exists in the GitHub repository.
      </p>
    `;
  }
}

document.addEventListener("DOMContentLoaded", initializeMap);
