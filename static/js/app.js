const $ = (id) => document.getElementById(id);
let currentFile = null;
let currentResult = null;
let currentRows = [];
let sortKey = "rank";
let sortDirection = 1;
let network = null;
let toastTimer = null;

const metricLabels = { pagerank: "PageRank", authority: "HITS authority", hub: "HITS hub", in_degree: "In-degree", out_degree: "Out-degree" };
const algorithmNotes = {
  pagerank: "<strong>PageRank</strong> considers both the quantity and quality of incoming links. Scores sum to approximately 1 across the graph.",
  hits: "<strong>HITS</strong> calculates two scores: authority for pages linked by useful hubs, and hub for pages that point to useful authorities.",
  indegree: "<strong>In-degree ranking</strong> counts direct incoming links. It is a useful baseline, but does not consider the importance of the linking pages."
};

function showAlert(message, type = "error") {
  const box = $("alertBox");
  box.textContent = message;
  box.className = `alert ${type}`;
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function hideAlert() { $("alertBox").hidden = true; }
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, 2800);
}
function setDatasetLabel(label, rows, total) {
  $("datasetInfo").innerHTML = `<span class="status-dot"></span><span>${escapeHtml(label)} · ${total} valid links</span>`;
  $("previewWrap").hidden = false;
  $("previewCount").textContent = `${total} rows`;
  $("previewBody").innerHTML = rows.map(row => `<tr><td>${escapeHtml(row.source)}</td><td>${escapeHtml(row.target)}</td></tr>`).join("");
  $("runAnalysis").disabled = false;
  $("formHint").textContent = "Ready to analyze this dataset.";
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function updateFile(file) {
  currentFile = file || null;
  if (currentFile) {
    $("fileTitle").textContent = currentFile.name;
    $("fileSubtitle").textContent = `${(currentFile.size / 1024).toFixed(1)} KB · Click to replace`;
    $("datasetInfo").innerHTML = `<span class="status-dot muted"></span><span>CSV selected · Preview appears after validation</span>`;
    $("runAnalysis").disabled = false;
    $("formHint").textContent = "Run analysis to validate and process this file.";
  }
}
async function loadSample(showMessage = true) {
  hideAlert();
  currentFile = null;
  $("csvFile").value = "";
  $("fileTitle").textContent = "Drop your CSV here";
  $("fileSubtitle").innerHTML = 'or <u>browse files</u>';
  try {
    const response = await fetch("/api/sample");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load the sample dataset.");
    setDatasetLabel("Sample dataset", data.rows, data.total_rows);
    $("datasetInfo").dataset.sample = "true";
    if (showMessage) toast("Sample dataset loaded. Run an analysis when you're ready.");
    return true;
  } catch (error) {
    showAlert(error.message);
    return false;
  }
}
$("loadSample").addEventListener("click", () => loadSample());
$("heroSample").addEventListener("click", async () => {
  const ok = await loadSample();
  if (ok) $("analyze").scrollIntoView({ behavior: "smooth" });
});
$("csvFile").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv")) {
    currentFile = null; $("runAnalysis").disabled = true;
    showAlert("Please choose a CSV file with a .csv extension."); return;
  }
  if (file.size > 5 * 1024 * 1024) {
    currentFile = null; $("runAnalysis").disabled = true;
    showAlert("This file is larger than 5 MB. Please choose a smaller CSV."); return;
  }
  hideAlert(); updateFile(file);
});
const dropZone = $("dropZone");
dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", e => {
  e.preventDefault(); dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv") || file.size > 5 * 1024 * 1024) {
    showAlert("Choose a CSV file under 5 MB."); return;
  }
  $("csvFile").files = e.dataTransfer.files;
  updateFile(file); hideAlert();
});
$("algorithm").addEventListener("change", () => {
  const value = $("algorithm").value;
  $("algorithmNote").querySelector("p").innerHTML = algorithmNotes[value];
});
$("runAnalysis").addEventListener("click", runAnalysis);

async function runAnalysis() {
  hideAlert();
  const btn = $("runAnalysis");
  btn.disabled = true;
  $("runLabel").textContent = "Analyzing…";
  $("runArrow").textContent = "◌";
  $("formHint").textContent = "Building graph and calculating scores.";
  const body = new FormData();
  body.append("algorithm", $("algorithm").value);
  if (currentFile) body.append("file", currentFile);
  else if ($("datasetInfo").dataset.sample === "true") body.append("use_sample", "true");
  else {
    showAlert("Choose a CSV file or load the sample dataset first.");
    btn.disabled = false; $("runLabel").textContent = "Run analysis"; $("runArrow").textContent = "→"; return;
  }
  try {
    const response = await fetch("/api/analyze", { method: "POST", body });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Analysis failed.");
    currentResult = data;
    currentRows = data.results.slice();
    renderResults(data);
    showAlert(`Analysis complete using ${data.algorithm_label}. ${data.stats.duplicates_removed} duplicate link(s) removed.`, "success");
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showAlert(error.message);
  } finally {
    btn.disabled = false; $("runLabel").textContent = "Run analysis"; $("runArrow").textContent = "→";
    $("formHint").textContent = "Ready to run another analysis.";
  }
}
function formatScore(n) {
  if (!Number.isFinite(Number(n))) return "0.000000";
  return Number(n).toFixed(6);
}
function renderResults(data) {
  $("emptyState").hidden = true;
  $("resultsContent").hidden = false;
  $("exportResults").disabled = false;
  $("resultsSubheading").textContent = `${data.algorithm_label} results · ${data.stats.nodes} pages and ${data.stats.edges} unique directed links`;
  $("statNodes").textContent = data.stats.nodes.toLocaleString();
  $("statEdges").textContent = data.stats.edges.toLocaleString();
  $("statTop").textContent = data.stats.top_page;
  $("statTop").title = data.stats.top_page;
  $("statTopScore").textContent = `${metricLabels[data.active_metric]}: ${formatScore(data.stats.top_score)}`;
  $("statDegree").textContent = Number(data.stats.average_in_degree).toFixed(2);
  $("rankingDescription").textContent = `Ranked by ${data.algorithm_label}; all metric scores are shown for comparison.`;
  $("chartMetric").value = data.active_metric;
  renderTable();
  renderChart();
  renderNetwork();
  renderInsight();
}
function filteredRows() {
  const query = $("tableSearch").value.trim().toLowerCase();
  const minDegree = $("degreeFilter").value;
  let rows = currentRows.filter(row => row.page.toLowerCase().includes(query));
  if (minDegree !== "all") rows = rows.filter(row => row.in_degree >= Number(minDegree));
  rows.sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    let comparison = typeof va === "string" ? va.localeCompare(vb, undefined, { sensitivity: "base" }) : va - vb;
    return comparison * sortDirection;
  });
  return rows;
}
function renderTable() {
  const rows = filteredRows();
  $("rankingBody").innerHTML = rows.map(row => `<tr><td><span class="rank-pill">${row.rank}</span></td><td>${escapeHtml(row.page)}</td><td>${row.in_degree}</td><td>${row.out_degree}</td><td>${formatScore(row.pagerank)}</td><td>${formatScore(row.authority)}</td><td>${formatScore(row.hub)}</td></tr>`).join("");
  $("tableCount").textContent = `Showing ${rows.length} of ${currentRows.length} pages`;
}
$("tableSearch").addEventListener("input", renderTable);
$("degreeFilter").addEventListener("change", renderTable);
document.querySelectorAll(".sort-button").forEach(button => button.addEventListener("click", () => {
  const nextKey = button.dataset.sort;
  if (sortKey === nextKey) sortDirection *= -1;
  else { sortKey = nextKey; sortDirection = nextKey === "page" ? 1 : -1; }
  renderTable();
}));
$("resetTable").addEventListener("click", () => {
  $("tableSearch").value = ""; $("degreeFilter").value = "all";
  sortKey = "rank"; sortDirection = 1; renderTable();
});
$("chartMetric").addEventListener("change", renderChart);
$("nodeMetric").addEventListener("change", renderNetwork);

function renderChart() {
  if (!currentResult || !window.Plotly) return;
  const metric = $("chartMetric").value;
  const rows = [...currentResult.results].sort((a,b) => b[metric] - a[metric]).slice(0,10).reverse();
  const values = rows.map(r => r[metric]);
  const data = [{
    type: "bar", orientation: "h", x: values, y: rows.map(r => r.page),
    marker: { color: values.map((v,i) => i === values.length-1 ? "#3266a8" : "#9cb7d8"), line: { width: 0 } },
    hovertemplate: "%{y}<br>" + metricLabels[metric] + ": %{x:.6f}<extra></extra>"
  }];
  const layout = {
    margin: {l: 8, r: 18, t: 8, b: 34}, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: {family: "DM Sans, sans-serif", size: 10, color: "#718094"},
    xaxis: {showgrid: true, gridcolor: "#edf1f5", zeroline: false, tickfont: {size: 9}},
    yaxis: {showgrid: false, automargin: true, tickfont: {size: 10}},
    bargap: .34, showlegend: false
  };
  Plotly.react("authorityChart", data, layout, {responsive: true, displayModeBar: false});
}
function renderNetwork() {
  if (!currentResult || !window.vis) {
    $("networkGraph").innerHTML = '<p style="padding:20px;color:#778598;font-size:12px">Network visualization library could not load. Rankings and charts are still available.</p>';
    return;
  }
  const metric = $("nodeMetric").value;
  const nodesRaw = currentResult.nodes;
  const vals = nodesRaw.map(n => Number(n[metric]) || 0);
  const max = Math.max(...vals, 0.000001);
  const nodes = nodesRaw.map(n => {
    const value = Number(n[metric]) || 0;
    const scaled = metric === "in_degree" || metric === "out_degree" ? value / max : value / max;
    return {
      id: n.id, label: n.label.length > 19 ? n.label.slice(0,17) + "…" : n.label,
      title: `${escapeHtml(n.label)}\nPageRank: ${formatScore(n.pagerank)}\nAuthority: ${formatScore(n.authority)}\nHub: ${formatScore(n.hub)}\nIn-degree: ${n.in_degree}\nOut-degree: ${n.out_degree}`,
      value: 1 + scaled * 4, color: {background: `rgba(${Math.round(70-22*scaled)},${Math.round(119-35*scaled)},${Math.round(177-20*scaled)},${0.72+0.28*scaled})`, border: "#ffffff", highlight: {background:"#dceafb",border:"#3266a8"}},
      font: {color:"#33465d", size: 11, face:"DM Sans"}
    };
  });
  const edges = currentResult.edges.map((e,i) => ({id:i, from:e.source, to:e.target, arrows:"to", color:{color:"#c4d0de",highlight:"#3266a8",hover:"#3266a8"}, width:1.2, smooth:{type:"dynamic"}}));
  const container = $("networkGraph");
  if (network) { network.destroy(); network = null; }
  network = new vis.Network(container, {nodes:new vis.DataSet(nodes), edges:new vis.DataSet(edges)}, {
    autoResize:true, physics:{stabilization:{iterations:120}, barnesHut:{gravitationalConstant:-4500,springLength:115,springConstant:.035}},
    interaction:{hover:true, tooltipDelay:120, navigationButtons:false, keyboard:{enabled:true}},
    nodes:{shape:"dot", scaling:{min:10,max:28}, borderWidth:1.5},
    edges:{arrows:{to:{enabled:true,scaleFactor:.65}}, smooth:{enabled:true,type:"dynamic"}},
    layout:{improvedLayout:true}
  });
}
function renderInsight() {
  const data = currentResult;
  const top = data.results[0];
  const countTop = data.results.filter(r => r[data.active_metric] === top[data.active_metric]).length;
  $("insightTitle").textContent = `${top.page} ranks first`;
  let description;
  if (data.algorithm === "pagerank") {
    description = `${top.page} has the highest PageRank (${formatScore(top.pagerank)}). PageRank rewards links from pages that are themselves important, so this result reflects the structure of the whole link network rather than only a raw link count.`;
  } else if (data.algorithm === "hits") {
    description = `${top.page} has the highest HITS authority score (${formatScore(top.authority)}). Authority scores are influenced by incoming links from pages that behave like useful hubs. Check the hub column to see which pages point outward to other important pages.`;
  } else {
    description = `${top.page} receives the most direct incoming links (${top.in_degree}). In-degree is easy to interpret, but treats every incoming link equally and does not measure the importance of the linking pages.`;
  }
  if (countTop > 1) description += ` There is a tie at the top across ${countTop} pages.`;
  $("insightText").textContent = description;
}
$("exportResults").addEventListener("click", async () => {
  if (!currentResult) return;
  try {
    const response = await fetch("/api/export", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({results:currentResult.results})
    });
    if (!response.ok) {
      const error = await response.json(); throw new Error(error.error || "Export failed.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "link_authority_results.csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Results CSV exported.");
  } catch (error) { showAlert(error.message); }
});
$("menuToggle").addEventListener("click", () => {
  const nav = $("navLinks");
  const open = nav.classList.toggle("open");
  $("menuToggle").setAttribute("aria-expanded", String(open));
});
document.querySelectorAll("#navLinks a").forEach(a => a.addEventListener("click", () => {
  $("navLinks").classList.remove("open"); $("menuToggle").setAttribute("aria-expanded","false");
}));
window.addEventListener("resize", () => {
  if (currentResult && window.Plotly) Plotly.Plots.resize($("authorityChart"));
});
// Prepare a useful preview without automatically running analysis.
loadSample(false);
