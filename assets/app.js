(() => {
  "use strict";

  const DATA = Array.isArray(window.CHEMICAL_DATA) ? window.CHEMICAL_DATA : [];
  const SOURCE = window.CHEMICAL_SOURCE_SUMMARY || {};
  const PAGE_SIZE = 25;
  const state = { filtered: [...DATA], page: 1, charts: {} };
  const $ = id => document.getElementById(id);
  const text = value => String(value ?? "").trim();
  const normalize = value => text(value).toLowerCase().replace(/\s+/g, " ");

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  }

  function fillSelect(id, values, label) {
    const select = $(id);
    select.innerHTML = `<option value="">${label}</option>`;
    values.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function setupFilters() {
    fillSelect("departmentFilter", uniqueSorted(DATA.map(r => r.department)), "ทุกหน่วยงาน");
    fillSelect("hazardFilter", uniqueSorted(DATA.flatMap(r => r.hazards || [])), "ทุกประเภท");
    fillSelect("ppeFilter", uniqueSorted(DATA.flatMap(r => r.ppe || [])), "ทุกประเภท");
  }

  function matchesCompleteness(row, type) {
    if (!type) return true;
    if (type === "complete") return Boolean(row.storage && row.use);
    if (type === "missing-storage") return !row.storage;
    if (type === "missing-use") return !row.use;
    if (type === "missing-ppe") return !(row.ppe || []).length;
    return true;
  }

  function applyFilters() {
    const query = normalize($("searchInput").value);
    const department = $("departmentFilter").value;
    const hazard = $("hazardFilter").value;
    const ppe = $("ppeFilter").value;
    const completeness = $("completenessFilter").value;

    state.filtered = DATA.filter(row => {
      const blob = normalize([
        row.department, row.code, row.chemicalName, row.tradeName,
        row.quantity, row.storage, row.use,
        ...(row.hazards || []), ...(row.ppe || [])
      ].join(" "));
      return (!query || blob.includes(query))
        && (!department || row.department === department)
        && (!hazard || (row.hazards || []).includes(hazard))
        && (!ppe || (row.ppe || []).includes(ppe))
        && matchesCompleteness(row, completeness);
    });
    state.page = 1;
    render();
  }

  function clearFilters() {
    $("searchInput").value = "";
    $("departmentFilter").value = "";
    $("hazardFilter").value = "";
    $("ppeFilter").value = "";
    $("completenessFilter").value = "";
    state.filtered = [...DATA];
    state.page = 1;
    render();
  }

  function countBy(values) {
    const counts = new Map();
    values.forEach(value => {
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  function updateKpis(rows) {
    $("kpiRecords").textContent = rows.length.toLocaleString("th-TH");
    $("kpiUnique").textContent = new Set(rows.map(r => normalize(r.chemicalName)).filter(Boolean)).size.toLocaleString("th-TH");
    $("kpiDepartments").textContent = new Set(rows.map(r => r.department).filter(Boolean)).size.toLocaleString("th-TH");
    $("kpiHazard").textContent = rows.filter(r => (r.hazards || []).length).length.toLocaleString("th-TH");
    $("kpiPpe").textContent = rows.filter(r => (r.ppe || []).length).length.toLocaleString("th-TH");
    $("resultCount").textContent = rows.length.toLocaleString("th-TH");
  }

  function chartAvailable() {
    return typeof Chart !== "undefined";
  }

  function makeChart(id, type, labels, values, label, horizontal = false) {
    if (!chartAvailable()) return;
    if (state.charts[id]) state.charts[id].destroy();
    state.charts[id] = new Chart($(id), {
      type,
      data: { labels, datasets: [{ label, data: values, borderWidth: 1.5 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        plugins: { legend: { display: type === "doughnut", position: "bottom" } },
        scales: type === "doughnut" ? {} : {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }

  function renderCharts(rows) {
    const departments = countBy(rows.map(r => r.department));
    makeChart("departmentChart", "bar", departments.map(x => x[0]), departments.map(x => x[1]), "จำนวนรายการ", true);

    const hazards = countBy(rows.flatMap(r => r.hazards || []));
    makeChart("hazardChart", "bar", hazards.map(x => x[0]), hazards.map(x => x[1]), "จำนวนรายการ", true);

    const ppe = countBy(rows.flatMap(r => r.ppe || []));
    makeChart("ppeChart", "bar", ppe.map(x => x[0]), ppe.map(x => x[1]), "จำนวนรายการ");

    const total = rows.length || 1;
    const quality = [
      ["มีรหัสสารเคมี", rows.filter(r => r.code).length],
      ["มีปริมาณ", rows.filter(r => r.quantity).length],
      ["มีสถานที่เก็บ", rows.filter(r => r.storage).length],
      ["มีการใช้ประโยชน์", rows.filter(r => r.use).length],
      ["มีข้อมูล PPE", rows.filter(r => (r.ppe || []).length).length]
    ];
    makeChart(
      "qualityChart",
      "bar",
      quality.map(x => x[0]),
      quality.map(x => Math.round((x[1] / total) * 100)),
      "ร้อยละความครบถ้วน"
    );
  }

  function badgeList(items, kind) {
    const wrap = document.createElement("div");
    wrap.className = "badge-list";
    if (!items || !items.length) {
      const badge = document.createElement("span");
      badge.className = "badge none";
      badge.textContent = "ไม่ระบุ";
      wrap.appendChild(badge);
      return wrap;
    }
    items.forEach(item => {
      const badge = document.createElement("span");
      badge.className = `badge ${kind}`;
      badge.textContent = item;
      wrap.appendChild(badge);
    });
    return wrap;
  }

  function makeCell(value, className = "") {
    const td = document.createElement("td");
    td.textContent = value || "–";
    if (className) td.className = className;
    return td;
  }

  function renderTable(rows) {
    const tbody = $("tableBody");
    tbody.innerHTML = "";
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 9;
      td.className = "empty";
      td.textContent = "ไม่พบข้อมูลตามเงื่อนไขที่เลือก";
      tr.appendChild(td);
      tbody.appendChild(tr);
      $("pagination").innerHTML = "";
      return;
    }

    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * PAGE_SIZE;

    rows.slice(start, start + PAGE_SIZE).forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.appendChild(makeCell(String(start + index + 1)));
      tr.appendChild(makeCell(row.department));
      tr.appendChild(makeCell(row.code));

      const nameCell = document.createElement("td");
      nameCell.className = "name-cell";
      const name = document.createElement("b");
      name.textContent = row.chemicalName || "ไม่ระบุชื่อ";
      nameCell.appendChild(name);
      if (row.tradeName) {
        const trade = document.createElement("span");
        trade.textContent = row.tradeName;
        nameCell.appendChild(trade);
      }
      tr.appendChild(nameCell);

      tr.appendChild(makeCell(row.quantity));
      tr.appendChild(makeCell(row.storage, "detail-cell"));
      tr.appendChild(makeCell(row.use, "detail-cell"));

      const hazardCell = document.createElement("td");
      hazardCell.appendChild(badgeList(row.hazards, "hazard"));
      tr.appendChild(hazardCell);

      const ppeCell = document.createElement("td");
      ppeCell.appendChild(badgeList(row.ppe, "ppe"));
      tr.appendChild(ppeCell);

      tbody.appendChild(tr);
    });

    renderPagination(pageCount);
  }

  function renderPagination(pageCount) {
    const wrap = $("pagination");
    wrap.innerHTML = "";
    if (pageCount <= 1) return;

    const addButton = (label, page, disabled = false, active = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `page-btn${active ? " active" : ""}`;
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener("click", () => {
        state.page = page;
        renderTable(state.filtered);
        document.querySelector(".table-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      wrap.appendChild(button);
    };

    addButton("‹", Math.max(1, state.page - 1), state.page === 1);
    const first = Math.max(1, Math.min(state.page - 2, pageCount - 4));
    const last = Math.min(pageCount, first + 4);
    for (let page = first; page <= last; page++) {
      addButton(String(page), page, false, page === state.page);
    }
    addButton("›", Math.min(pageCount, state.page + 1), state.page === pageCount);
  }

  function escapeCsv(value) {
    const string = String(value ?? "");
    return /[",\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
  }

  function exportFiltered() {
    const headers = [
      "หน่วยงาน", "รหัสสารเคมี", "ชื่อสารเคมี", "Trade Name",
      "ปริมาณ", "สถานที่เก็บ", "การใช้ประโยชน์", "ความเป็นอันตราย", "PPE"
    ];
    const rows = state.filtered.map(row => [
      row.department, row.code, row.chemicalName, row.tradeName,
      row.quantity, row.storage, row.use,
      (row.hazards || []).join(" | "), (row.ppe || []).join(" | ")
    ]);
    const csv = "\ufeff" + [headers, ...rows].map(row => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dontum-chemical-filtered.csv";
    link.click();
    URL.revokeObjectURL(url);
    showToast("ส่งออกข้อมูลที่กรองแล้วเรียบร้อย");
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function render() {
    updateKpis(state.filtered);
    renderCharts(state.filtered);
    renderTable(state.filtered);
  }

  function init() {
    setupFilters();
    $("sourceSummary").textContent =
      `ข้อมูล ${Number(SOURCE.recordCount || DATA.length).toLocaleString("th-TH")} รายการ • ` +
      `${Number(SOURCE.departmentCount || 0).toLocaleString("th-TH")} หน่วยงาน • ` +
      `${Number(SOURCE.uniqueChemicalCount || 0).toLocaleString("th-TH")} ชื่อสารเคมีไม่ซ้ำ`;

    $("searchInput").addEventListener("input", applyFilters);
    ["departmentFilter", "hazardFilter", "ppeFilter", "completenessFilter"]
      .forEach(id => $(id).addEventListener("change", applyFilters));
    $("clearFilters").addEventListener("click", clearFilters);
    $("exportFiltered").addEventListener("click", exportFiltered);

    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
