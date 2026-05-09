const DATASET_PATH = "data/processed/smart_healthcare_cleaned.csv";

const STATUS_ORDER = ["Critical", "High_Risk", "Moderate_Risk", "Stable"];
const STATUS_META = {
  Critical: { label: "Critical", color: "#c84f3d", severity: 4 },
  High_Risk: { label: "High Risk", color: "#dc9d2e", severity: 3 },
  Moderate_Risk: { label: "Moderate Risk", color: "#6578d6", severity: 2 },
  Stable: { label: "Stable", color: "#239a69", severity: 1 },
};

const METRICS = [
  { key: "Stress_Index", label: "Stress Index", unit: "", precision: 1 },
  { key: "Medical_Alert_Frequency", label: "Medical Alert Frequency", unit: " alerts", precision: 1 },
  { key: "Heart_Rate", label: "Heart Rate", unit: " bpm", precision: 1 },
  { key: "Blood_Pressure", label: "Blood Pressure", unit: " mmHg", precision: 1 },
  { key: "Blood_Oxygen_Level", label: "Blood Oxygen Level", unit: "%", precision: 1 },
  { key: "Glucose_Level", label: "Glucose Level", unit: " mg/dL", precision: 1 },
  { key: "Daily_Steps", label: "Daily Steps", unit: " steps", precision: 0 },
  { key: "EHR_Data_Completeness", label: "EHR Data Completeness", unit: "%", precision: 1 },
  { key: "Healthcare_Network_Latency_ms", label: "Network Latency", unit: " ms", precision: 1 },
];

const NUMERIC_COLUMNS = [
  "Heart_Rate",
  "Blood_Pressure",
  "Blood_Oxygen_Level",
  "Body_Temperature",
  "Respiration_Rate",
  "Glucose_Level",
  "ECG_Signal_Intensity",
  "Activity_Level",
  "Sleep_Duration_Hours",
  "Stress_Index",
  "IoT_Device_Connectivity",
  "EHR_Data_Completeness",
  "Wearable_Device_Count",
  "Daily_Steps",
  "Healthcare_Network_Latency_ms",
  "Cloud_Data_Transfer_Rate",
  "Medical_Alert_Frequency",
  "Risk_Score",
  "Digital_Readiness_Score",
];

const state = {
  data: [],
  status: "All",
  metric: "Stress_Index",
};

const elements = {
  statusFilters: document.querySelector("#statusFilters"),
  metricSelect: document.querySelector("#metricSelect"),
  datasetMeta: document.querySelector("#datasetMeta"),
  kpiTotal: document.querySelector("#kpiTotal"),
  kpiTotalSub: document.querySelector("#kpiTotalSub"),
  kpiAcuity: document.querySelector("#kpiAcuity"),
  kpiAcuitySub: document.querySelector("#kpiAcuitySub"),
  kpiAlerts: document.querySelector("#kpiAlerts"),
  kpiAlertsSub: document.querySelector("#kpiAlertsSub"),
  kpiReadiness: document.querySelector("#kpiReadiness"),
  kpiReadinessSub: document.querySelector("#kpiReadinessSub"),
  kpiLatency: document.querySelector("#kpiLatency"),
  kpiLatencySub: document.querySelector("#kpiLatencySub"),
  distributionTotal: document.querySelector("#distributionTotal"),
  riskDonut: document.querySelector("#riskDonut"),
  donutRiskPct: document.querySelector("#donutRiskPct"),
  statusLegend: document.querySelector("#statusLegend"),
  metricChartTitle: document.querySelector("#metricChartTitle"),
  metricBars: document.querySelector("#metricBars"),
  scatterPlot: document.querySelector("#scatterPlot"),
  scatterCount: document.querySelector("#scatterCount"),
  watchlistBody: document.querySelector("#watchlistBody"),
  insightList: document.querySelector("#insightList"),
};

init();

async function init() {
  setupMetricSelect();

  try {
    const response = await fetch(DATASET_PATH);
    if (!response.ok) {
      throw new Error(`Unable to load ${DATASET_PATH}`);
    }

    const csvText = await response.text();
    state.data = parseCSV(csvText).map(normalizeRecord);
    elements.datasetMeta.textContent = `${formatNumber(state.data.length)} patient records`;
    setupStatusFilters();
    render();
  } catch (error) {
    renderLoadError(error);
  }
}

function setupMetricSelect() {
  elements.metricSelect.innerHTML = METRICS.map(
    (metric) => `<option value="${metric.key}">${metric.label}</option>`,
  ).join("");

  elements.metricSelect.value = state.metric;
  elements.metricSelect.addEventListener("change", (event) => {
    state.metric = event.target.value;
    render();
  });
}

function setupStatusFilters() {
  const filters = ["All", ...STATUS_ORDER];
  elements.statusFilters.innerHTML = filters
    .map((status) => {
      const count = status === "All" ? state.data.length : countByStatus(state.data)[status] || 0;
      const label = status === "All" ? "All" : STATUS_META[status].label;
      const color = status === "All" ? "#087e8b" : STATUS_META[status].color;
      return `
        <button type="button" data-status="${status}" style="--active-color: ${color}" aria-pressed="${status === state.status}">
          ${label} ${formatNumber(count)}
        </button>
      `;
    })
    .join("");

  elements.statusFilters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.status = button.dataset.status;
      render();
    });
  });
}

function render() {
  const filtered = getFilteredData();

  elements.statusFilters.querySelectorAll("button").forEach((button) => {
    const isActive = button.dataset.status === state.status;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  renderKpis(filtered);
  renderDistribution(filtered);
  renderMetricBars(filtered);
  renderScatter(filtered);
  renderWatchlist(filtered);
  renderInsights(filtered);
}

function getFilteredData() {
  if (state.status === "All") {
    return state.data;
  }

  return state.data.filter((record) => record.Patient_Health_Status === state.status);
}

function renderKpis(records) {
  const total = records.length;
  const highAcuity = records.filter((record) =>
    ["Critical", "High_Risk"].includes(record.Patient_Health_Status),
  ).length;
  const readiness = average(records, getReadinessScore);
  const alerts = average(records, (record) => record.Medical_Alert_Frequency);
  const latency = average(records, (record) => record.Healthcare_Network_Latency_ms);

  elements.kpiTotal.textContent = formatNumber(total);
  elements.kpiTotalSub.textContent = `${formatPercent(total / state.data.length)} of full dataset`;
  elements.kpiAcuity.textContent = formatPercent(highAcuity / total);
  elements.kpiAcuitySub.textContent = `${formatNumber(highAcuity)} critical or high risk`;
  elements.kpiAlerts.textContent = formatDecimal(alerts, 1);
  elements.kpiAlertsSub.textContent = "Mean patient alert count";
  elements.kpiReadiness.textContent = formatPercent(readiness / 100);
  elements.kpiReadinessSub.textContent = "Composite connected-care score";
  elements.kpiLatency.textContent = `${formatDecimal(latency, 0)} ms`;
  elements.kpiLatencySub.textContent = latency <= 120 ? "Within operating target" : "Above 120 ms target";
}

function renderDistribution(records) {
  const counts = countByStatus(records);
  const total = records.length;
  const highAcuity = (counts.Critical || 0) + (counts.High_Risk || 0);

  elements.distributionTotal.textContent = `${formatNumber(total)} records`;
  elements.donutRiskPct.textContent = formatPercent(highAcuity / total);

  let cursor = 0;
  const gradient = STATUS_ORDER.map((status) => {
    const value = counts[status] || 0;
    const span = total ? (value / total) * 360 : 0;
    const start = cursor;
    cursor += span;
    return `${STATUS_META[status].color} ${start}deg ${cursor}deg`;
  });

  elements.riskDonut.style.background = total
    ? `conic-gradient(${gradient.join(", ")})`
    : "conic-gradient(#dce6df 0deg 360deg)";

  elements.statusLegend.innerHTML = STATUS_ORDER.map((status) => {
    const value = counts[status] || 0;
    const percent = formatPercent(value / total);
    return `
      <div class="legend-row">
        <div class="legend-top">
          <span class="status-name">
            <i class="status-dot" style="--status-color: ${STATUS_META[status].color}"></i>
            ${STATUS_META[status].label}
          </span>
          <strong>${formatNumber(value)}</strong>
        </div>
        <div class="track"><span class="track-fill" style="--bar-color: ${STATUS_META[status].color}; width: ${safePercent(value / total)}%"></span></div>
        <span>${percent} of selected cohort</span>
      </div>
    `;
  }).join("");
}

function renderMetricBars(records) {
  const metric = METRICS.find((item) => item.key === state.metric);
  elements.metricChartTitle.textContent = `${metric.label} by Status`;

  const rows =
    state.status === "All"
      ? STATUS_ORDER.map((status) => ({
          label: STATUS_META[status].label,
          status,
          value: average(state.data.filter((record) => record.Patient_Health_Status === status), (record) => record[metric.key]),
        }))
      : [
          {
            label: STATUS_META[state.status].label,
            status: state.status,
            value: average(records, (record) => record[metric.key]),
          },
          {
            label: "Overall Baseline",
            status: "All",
            value: average(state.data, (record) => record[metric.key]),
          },
        ];

  const max = Math.max(...rows.map((row) => row.value), 1);

  elements.metricBars.innerHTML = rows
    .map((row) => {
      const color = row.status === "All" ? "#087e8b" : STATUS_META[row.status].color;
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <span>${row.label}</span>
            <strong>${formatMetric(row.value, metric)}</strong>
          </div>
          <div class="track"><span class="track-fill" style="--bar-color: ${color}; width: ${safePercent(row.value / max)}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderScatter(records) {
  const width = 720;
  const height = 360;
  const margin = { top: 22, right: 22, bottom: 52, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const sampled = sampleRecords(records, 680);
  const xExtent = extent(state.data, (record) => record.EHR_Data_Completeness);
  const yExtent = extent(state.data, (record) => record.IoT_Device_Connectivity);

  const xScale = (value) =>
    margin.left + ((value - xExtent[0]) / Math.max(xExtent[1] - xExtent[0], 1)) * plotWidth;
  const yScale = (value) =>
    margin.top + plotHeight - ((value - yExtent[0]) / Math.max(yExtent[1] - yExtent[0], 1)) * plotHeight;

  elements.scatterCount.textContent = `${formatNumber(sampled.length)} plotted`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((step) => {
      const x = margin.left + step * plotWidth;
      const y = margin.top + step * plotHeight;
      const xValue = xExtent[0] + step * (xExtent[1] - xExtent[0]);
      const yValue = yExtent[1] - step * (yExtent[1] - yExtent[0]);
      return `
        <line class="scatter-grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotHeight}"></line>
        <line class="scatter-grid" x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}"></line>
        <text class="scatter-tick" x="${x}" y="${margin.top + plotHeight + 22}" text-anchor="middle">${formatDecimal(xValue, 0)}</text>
        <text class="scatter-tick" x="${margin.left - 12}" y="${y + 4}" text-anchor="end">${formatDecimal(yValue, 0)}</text>
      `;
    })
    .join("");

  const points = sampled
    .map((record) => {
      const status = record.Patient_Health_Status;
      const radius = 3 + (record.Medical_Alert_Frequency / 14) * 4;
      return `
        <circle
          cx="${xScale(record.EHR_Data_Completeness).toFixed(2)}"
          cy="${yScale(record.IoT_Device_Connectivity).toFixed(2)}"
          r="${radius.toFixed(2)}"
          fill="${STATUS_META[status].color}"
          fill-opacity="0.62"
          stroke="#ffffff"
          stroke-width="0.8"
        ></circle>
      `;
    })
    .join("");

  elements.scatterPlot.setAttribute("viewBox", `0 0 ${width} ${height}`);
  elements.scatterPlot.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent"></rect>
    ${gridLines}
    <line class="scatter-axis" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}"></line>
    <line class="scatter-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}"></line>
    ${points}
    <text class="scatter-label" x="${margin.left + plotWidth / 2}" y="${height - 12}" text-anchor="middle">EHR completeness (%)</text>
    <text class="scatter-label" x="18" y="${margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 18 ${margin.top + plotHeight / 2})">IoT connectivity (%)</text>
  `;
}

function renderWatchlist(records) {
  const topRecords = [...records]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 8);

  if (!topRecords.length) {
    elements.watchlistBody.innerHTML = `<tr><td colspan="6">No records available.</td></tr>`;
    return;
  }

  elements.watchlistBody.innerHTML = topRecords
    .map((record) => {
      const statusMeta = STATUS_META[record.Patient_Health_Status];
      return `
        <tr>
          <td>${record.patientId}</td>
          <td><span class="status-badge" style="--badge-color: ${statusMeta.color}">${statusMeta.label}</span></td>
          <td><span class="score-pill">${formatDecimal(record.priorityScore, 0)}</span></td>
          <td>${formatDecimal(record.Heart_Rate, 0)} bpm / ${formatDecimal(record.Blood_Pressure, 0)} mmHg / ${formatDecimal(record.Blood_Oxygen_Level, 1)}%</td>
          <td>${formatDecimal(record.Medical_Alert_Frequency, 0)}</td>
          <td>${formatDecimal(record.EHR_Data_Completeness, 0)}%</td>
        </tr>
      `;
    })
    .join("");
}

function renderInsights(records) {
  const total = records.length;
  const counts = countByStatus(records);
  const highAcuity = (counts.Critical || 0) + (counts.High_Risk || 0);
  const lowEhr = records.filter((record) => record.EHR_Data_Completeness < 60).length;
  const highLatency = records.filter((record) => record.Healthcare_Network_Latency_ms > 180).length;
  const avgStress = average(records, (record) => record.Stress_Index);
  const avgSleep = average(records, (record) => record.Sleep_Duration_Hours);
  const avgAlertsCritical = average(
    state.data.filter((record) => record.Patient_Health_Status === "Critical"),
    (record) => record.Medical_Alert_Frequency,
  );
  const avgAlertsStable = average(
    state.data.filter((record) => record.Patient_Health_Status === "Stable"),
    (record) => record.Medical_Alert_Frequency,
  );

  const insights = [
    {
      title: "Acuity concentration",
      body: `${formatNumber(highAcuity)} records (${formatPercent(highAcuity / total)}) are Critical or High Risk in the selected cohort.`,
    },
    {
      title: "Clinical pressure",
      body: `Average stress is ${formatDecimal(avgStress, 1)} with ${formatDecimal(avgSleep, 1)} hours of sleep, a useful pairing for wellness triage.`,
    },
    {
      title: "Operational exposure",
      body: `${formatNumber(highLatency)} records exceed 180 ms latency, while ${formatNumber(lowEhr)} records have EHR completeness below 60%.`,
    },
    {
      title: "Alert gap",
      body: `Critical records average ${formatDecimal(avgAlertsCritical, 1)} alerts versus ${formatDecimal(avgAlertsStable, 1)} for Stable records.`,
    },
  ];

  elements.insightList.innerHTML = insights
    .map(
      (insight) => `
        <div class="insight-item">
          <strong>${insight.title}</strong>
          <span>${insight.body}</span>
        </div>
      `,
    )
    .join("");
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows.map((cells) =>
    headers.reduce((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {}),
  );
}

function normalizeRecord(record, index) {
  const normalized = {
    ...record,
    patientId: record.Patient_Record_ID || `P-${String(index + 1).padStart(4, "0")}`,
  };

  NUMERIC_COLUMNS.forEach((key) => {
    normalized[key] = Number.parseFloat(normalized[key]);
  });

  normalized.priorityScore = Number.isFinite(normalized.Risk_Score)
    ? normalized.Risk_Score
    : getPriorityScore(normalized);
  return normalized;
}

function getPriorityScore(record) {
  const statusWeight = STATUS_META[record.Patient_Health_Status]?.severity || 1;
  const vitals =
    deviation(record.Heart_Rate, 60, 100, 45, 180) * 11 +
    deviation(record.Blood_Pressure, 90, 130, 80, 200) * 12 +
    deviation(record.Blood_Oxygen_Level, 95, 100, 85, 100) * 13 +
    deviation(record.Body_Temperature, 36.1, 37.5, 34, 41) * 9 +
    deviation(record.Respiration_Rate, 12, 20, 8, 40) * 9 +
    deviation(record.Glucose_Level, 70, 140, 60, 300) * 8;
  const lifestyle =
    normalizeHigh(record.Stress_Index, 0, 100) * 8 +
    normalizeLow(record.Sleep_Duration_Hours, 2, 10) * 5 +
    normalizeLow(record.Daily_Steps, 1000, 18000) * 4;
  const operations =
    normalizeHigh(record.Medical_Alert_Frequency, 0, 14) * 10 +
    normalizeLow(record.EHR_Data_Completeness, 30, 100) * 5 +
    normalizeHigh(record.Healthcare_Network_Latency_ms, 5, 249) * 4;

  return clamp(statusWeight * 12 + vitals + lifestyle + operations, 0, 100);
}

function getReadinessScore(record) {
  const wearableScore = clamp((record.Wearable_Device_Count / 5) * 100, 0, 100);
  return averageValues([
    record.IoT_Device_Connectivity,
    record.EHR_Data_Completeness,
    record.Cloud_Data_Transfer_Rate,
    wearableScore,
  ]);
}

function countByStatus(records) {
  return records.reduce((counts, record) => {
    counts[record.Patient_Health_Status] = (counts[record.Patient_Health_Status] || 0) + 1;
    return counts;
  }, {});
}

function average(records, accessor) {
  if (!records.length) {
    return 0;
  }

  return records.reduce((sum, record) => sum + accessor(record), 0) / records.length;
}

function averageValues(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function extent(records, accessor) {
  return records.reduce(
    (bounds, record) => {
      const value = accessor(record);
      return [Math.min(bounds[0], value), Math.max(bounds[1], value)];
    },
    [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
  );
}

function sampleRecords(records, maxPoints) {
  if (records.length <= maxPoints) {
    return records;
  }

  const step = records.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => records[Math.floor(index * step)]);
}

function deviation(value, idealLow, idealHigh, observedLow, observedHigh) {
  if (value >= idealLow && value <= idealHigh) {
    return 0;
  }

  if (value < idealLow) {
    return clamp((idealLow - value) / Math.max(idealLow - observedLow, 1), 0, 1);
  }

  return clamp((value - idealHigh) / Math.max(observedHigh - idealHigh, 1), 0, 1);
}

function normalizeHigh(value, min, max) {
  return clamp((value - min) / Math.max(max - min, 1), 0, 1);
}

function normalizeLow(value, min, max) {
  return 1 - normalizeHigh(value, min, max);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function safePercent(value) {
  return Number.isFinite(value) ? clamp(value * 100, 0, 100).toFixed(2) : 0;
}

function formatMetric(value, metric) {
  return `${formatDecimal(value, metric.precision)}${metric.unit}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatDecimal(value, precision = 1) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0);
}

function renderLoadError(error) {
  document.querySelector("main").innerHTML = `
    <section class="empty-state">
      <strong>Dashboard data could not be loaded.</strong>
      <p>${error.message}</p>
    </section>
  `;
}
