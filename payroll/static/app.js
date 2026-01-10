const fileInput = document.getElementById("fileInput");
const chatFileInput = document.getElementById("chatFileInput");
const loadBtn = document.getElementById("loadBtn");
const clearBtn = document.getElementById("clearBtn");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const defaultPercent = document.getElementById("defaultPercent");
const statusText = document.getElementById("statusText");
const tableBody = document.getElementById("tableBody");
const sumSales = document.getElementById("sumSales");
const sumBonus = document.getElementById("sumBonus");
const sumTotal = document.getElementById("sumTotal");
const aiToggle = document.getElementById("aiToggle");
const aiTestBtn = document.getElementById("aiTestBtn");

const detailName = document.getElementById("detailName");
const detailPercent = document.getElementById("detailPercent");
const detailPenalty = document.getElementById("detailPenalty");
const applyBtn = document.getElementById("applyBtn");

const statClocked = document.getElementById("statClocked");
const statScheduled = document.getElementById("statScheduled");
const statSalesHour = document.getElementById("statSalesHour");
const statMsgHour = document.getElementById("statMsgHour");
const statFansHour = document.getElementById("statFansHour");
const statRespClock = document.getElementById("statRespClock");
const insightList = document.getElementById("insightList");
const cmpSales = document.getElementById("cmpSales");
const cmpSalesHour = document.getElementById("cmpSalesHour");
const cmpMsgHour = document.getElementById("cmpMsgHour");
const cmpReply = document.getElementById("cmpReply");
const cmpPaid = document.getElementById("cmpPaid");
const cmpCvr = document.getElementById("cmpCvr");
const whyList = document.getElementById("whyList");
const howList = document.getElementById("howList");
const ppvList = document.getElementById("ppvList");
const baitRecList = document.getElementById("baitRecList");
const sentencesList = document.getElementById("sentencesList");
const baitsList = document.getElementById("baitsList");
const compareA = document.getElementById("compareA");
const compareB = document.getElementById("compareB");
const compareBtn = document.getElementById("compareBtn");
const compareWhyA = document.getElementById("compareWhyA");
const compareWhyB = document.getElementById("compareWhyB");
const comparePpv = document.getElementById("comparePpv");
const compareBaits = document.getElementById("compareBaits");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
const ppvAssList = document.getElementById("ppvAssList");
const ppvTitsList = document.getElementById("ppvTitsList");
const ppvOverallList = document.getElementById("ppvOverallList");

let employees = [];
let selectedEmployee = null;
let chart = null;
let ppvMonth = { ass: [], tits: [], overall: [] };

function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}

function formatMaybe(value, suffix = "") {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${value.toFixed(2)}${suffix}`;
}

function formatRank(compare) {
  if (!compare) {
    return "-";
  }
  const pct = compare.percentile === null ? "-" : `${compare.percentile.toFixed(0)}%`;
  return `#${compare.rank}/${compare.total} (${pct})`;
}

function renderList(listEl, items) {
  listEl.innerHTML = "";
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.textContent = "-";
    listEl.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    listEl.appendChild(li);
  });
}

function renderPpvList(listEl, items) {
  listEl.innerHTML = "";
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.textContent = "-";
    listEl.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.text} (purchases ${item.purchased}, offers ${item.count})`;
    listEl.appendChild(li);
  });
}

function setActiveTab(tabId) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

function computeTotals() {
  let totalSales = 0;
  let totalBonus = 0;
  let totalPayout = 0;
  employees.forEach((emp) => {
    const base = emp.sales * emp.percent;
    const total = base + emp.bonus - emp.penalty;
    totalSales += emp.sales;
    totalBonus += emp.bonus;
    totalPayout += total;
    emp.basePay = base;
    emp.totalPay = total;
  });

  sumSales.textContent = formatMoney(totalSales);
  sumBonus.textContent = formatMoney(totalBonus);
  sumTotal.textContent = formatMoney(totalPayout);
}

function renderTable() {
  computeTotals();
  const sorted = [...employees].sort((a, b) => b.totalPay - a.totalPay);
  tableBody.innerHTML = "";
  sorted.forEach((emp) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${emp.employee}</td>
      <td>${(emp.percent * 100).toFixed(2)}%</td>
      <td>${formatMoney(emp.penalty)}</td>
      <td>${formatMoney(emp.sales)}</td>
      <td>${formatMoney(emp.bonus)}</td>
      <td>${formatMoney(emp.basePay)}</td>
      <td>${formatMoney(emp.totalPay)}</td>
    `;
    row.addEventListener("click", () => selectEmployee(emp.employee));
    tableBody.appendChild(row);
  });
}

function selectEmployee(name) {
  const emp = employees.find((e) => e.employee === name);
  if (!emp) {
    return;
  }
  selectedEmployee = emp;
  detailName.textContent = emp.employee;
  detailPercent.value = (emp.percent * 100).toFixed(2);
  detailPenalty.value = emp.penalty.toFixed(2);

  statClocked.textContent = formatMaybe(emp.clocked_hours, "h");
  statScheduled.textContent = formatMaybe(emp.scheduled_hours, "h");
  statSalesHour.textContent = formatMaybe(emp.sales_per_hour, "$");
  statMsgHour.textContent = formatMaybe(emp.messages_per_hour, "");
  statFansHour.textContent = formatMaybe(emp.fans_per_hour, "");
  statRespClock.textContent = formatMaybe(emp.response_clock_avg, "m");

  insightList.innerHTML = "";
  emp.insights.forEach((insight) => {
    const li = document.createElement("li");
    li.textContent = insight;
    insightList.appendChild(li);
  });

  const compare = emp.compare || {};
  cmpSales.textContent = formatRank(compare.sales);
  cmpSalesHour.textContent = formatRank(compare.sales_per_hour);
  cmpMsgHour.textContent = formatRank(compare.messages_per_hour);
  cmpReply.textContent = formatRank(compare.response_clock_avg);
  cmpPaid.textContent = formatRank(compare.chat_paid_offers);
  cmpCvr.textContent = formatRank(compare.chat_conversion_rate);

  const chatAi = emp.chat_ai || {};
  renderList(whyList, chatAi.why_money);
  renderList(howList, chatAi.how_money);
  renderList(ppvList, chatAi.ppv_suggestions);
  renderList(baitRecList, chatAi.bait_suggestions);

  const sentences = (emp.chat && emp.chat.top_sentences) || [];
  const baits = (emp.chat && emp.chat.top_baits) || [];
  renderList(
    sentencesList,
    sentences.map((x) => x.text)
  );
  renderList(
    baitsList,
    baits.map((x) => x.text)
  );

  renderChart(emp);
}

function renderChart(emp) {
  const labels = Object.keys(emp.daily_sales).sort();
  const values = labels.map((k) => emp.daily_sales[k]);
  const ctx = document.getElementById("salesChart");

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Daily sales",
          data: values,
          borderColor: "#22d3ee",
          backgroundColor: "rgba(34, 211, 238, 0.2)",
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(31,42,68,0.4)" },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(31,42,68,0.4)" },
        },
      },
      plugins: {
        legend: {
          labels: { color: "#e5e7eb" },
        },
      },
    },
  });
}

function resetUI() {
  employees = [];
  selectedEmployee = null;
  ppvMonth = { ass: [], tits: [], overall: [] };
  tableBody.innerHTML = "";
  detailName.textContent = "Select employee";
  detailPercent.value = "";
  detailPenalty.value = "";
  statClocked.textContent = "-";
  statScheduled.textContent = "-";
  statSalesHour.textContent = "-";
  statMsgHour.textContent = "-";
  statFansHour.textContent = "-";
  statRespClock.textContent = "-";
  insightList.innerHTML = "";
  cmpSales.textContent = "-";
  cmpSalesHour.textContent = "-";
  cmpMsgHour.textContent = "-";
  cmpReply.textContent = "-";
  cmpPaid.textContent = "-";
  cmpCvr.textContent = "-";
  whyList.innerHTML = "";
  howList.innerHTML = "";
  ppvList.innerHTML = "";
  baitRecList.innerHTML = "";
  sentencesList.innerHTML = "";
  baitsList.innerHTML = "";
  compareA.innerHTML = "";
  compareB.innerHTML = "";
  compareWhyA.innerHTML = "";
  compareWhyB.innerHTML = "";
  comparePpv.innerHTML = "";
  compareBaits.innerHTML = "";
  ppvAssList.innerHTML = "";
  ppvTitsList.innerHTML = "";
  ppvOverallList.innerHTML = "";
  sumSales.textContent = "$0.00";
  sumBonus.textContent = "$0.00";
  sumTotal.textContent = "$0.00";
  if (chart) {
    chart.destroy();
    chart = null;
  }
  setActiveTab("detailTab");
}

async function analyze() {
  const file = fileInput.files[0];
  if (!file) {
    statusText.textContent = "Select a sales Excel file.";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  if (chatFileInput.files[0]) {
    formData.append("chat_file", chatFileInput.files[0]);
  }
  if (dateFrom.value) {
    formData.append("date_from", dateFrom.value);
  }
  if (dateTo.value) {
    formData.append("date_to", dateTo.value);
  }
  formData.append("ai_enabled", aiToggle.checked ? "true" : "false");

  statusText.textContent = aiToggle.checked
    ? "Loading with AI enabled (may take longer)..."
    : "Loading...";

  let response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    statusText.textContent = `Request failed: ${err.message}`;
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    statusText.textContent = "Failed to parse server response.";
    return;
  }
  if (!response.ok) {
    statusText.textContent = data.error || "Failed to analyze file.";
    return;
  }

  dateFrom.min = data.min_date;
  dateFrom.max = data.max_date;
  dateTo.min = data.min_date;
  dateTo.max = data.max_date;
  if (!dateFrom.value) {
    dateFrom.value = data.min_date;
  }
  if (!dateTo.value) {
    dateTo.value = data.max_date;
  }

  const percentValue = parseFloat(defaultPercent.value) || 10;
  employees = data.employees.map((emp) => ({
    ...emp,
    percent: percentValue / 100,
    penalty: 0,
  }));
  ppvMonth = data.ppv_day || { ass: [], tits: [], overall: [] };
  renderPpvList(ppvAssList, ppvMonth.ass);
  renderPpvList(ppvTitsList, ppvMonth.tits);
  renderPpvList(ppvOverallList, ppvMonth.overall);

  compareA.innerHTML = "";
  compareB.innerHTML = "";
  employees.forEach((emp) => {
    const optA = document.createElement("option");
    optA.value = emp.employee;
    optA.textContent = emp.employee;
    compareA.appendChild(optA);
    const optB = document.createElement("option");
    optB.value = emp.employee;
    optB.textContent = emp.employee;
    compareB.appendChild(optB);
  });

  renderTable();
  if (data.ai_status === "enabled") {
    statusText.textContent = `Calculated with AI insights (${employees.length} employees).`;
  } else if (data.ai_status === "no_key") {
    statusText.textContent = `Calculated without AI (missing key). Employees: ${employees.length}.`;
  } else {
    statusText.textContent = `Calculated. Employees: ${employees.length}.`;
  }
}

applyBtn.addEventListener("click", () => {
  if (!selectedEmployee) {
    return;
  }
  const percentValue = parseFloat(detailPercent.value);
  const penaltyValue = parseFloat(detailPenalty.value);
  selectedEmployee.percent = isNaN(percentValue) ? selectedEmployee.percent : percentValue / 100;
  selectedEmployee.penalty = isNaN(penaltyValue) ? selectedEmployee.penalty : penaltyValue;
  renderTable();
});

loadBtn.addEventListener("click", analyze);
clearBtn.addEventListener("click", () => {
  resetUI();
  fileInput.value = "";
  chatFileInput.value = "";
  dateFrom.value = "";
  dateTo.value = "";
  statusText.textContent = "Cleared.";
});

aiTestBtn.addEventListener("click", async () => {
  statusText.textContent = "Testing AI...";
  const response = await fetch("/api/ai-test", { method: "POST" });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    statusText.textContent = `AI test failed: ${data.error || "unknown error"}`;
    return;
  }
  statusText.textContent = "AI test OK.";
});

compareBtn.addEventListener("click", async () => {
  if (!compareA.value || !compareB.value) {
    return;
  }
  const userA = employees.find((e) => e.employee === compareA.value);
  const userB = employees.find((e) => e.employee === compareB.value);
  if (!userA || !userB) {
    return;
  }

  const payload = {
    user_a: userA,
    user_b: userB,
    ai_enabled: aiToggle.checked,
  };

  let response;
  try {
    response = await fetch("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    statusText.textContent = `Compare failed: ${err.message}`;
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    statusText.textContent = "Compare failed: invalid response.";
    return;
  }
  if (!response.ok) {
    statusText.textContent = data.error || "Compare failed.";
    return;
  }

  const summary = data.summary || {};
  renderList(compareWhyA, summary.why_a_wins);
  renderList(compareWhyB, summary.why_b_lags);
  renderList(comparePpv, summary.ppv_recommendations);
  renderList(compareBaits, summary.bait_recommendations);
});

defaultPercent.addEventListener("change", () => {
  const percentValue = parseFloat(defaultPercent.value);
  if (isNaN(percentValue)) {
    return;
  }
  employees.forEach((emp) => {
    emp.percent = percentValue / 100;
  });
  renderTable();
});

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveTab(btn.dataset.tab);
  });
});
