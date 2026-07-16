(() => {
  "use strict";

  const CONFIG = window.CHEMICAL_DASHBOARD_CONFIG || {};
  const state = {
    rawRows: [],
    rows: [],
    filtered: [],
    headers: [],
    mapping: {},
    charts: {},
    page: 1
  };

  const FIELD_LABELS = {
    id: "ลำดับ/รหัสรายการ",
    department: "หน่วยงาน",
    chemicalName: "ชื่อสารเคมี",
    tradeName: "ชื่อทางการค้า",
    cas: "CAS No.",
    amount: "ปริมาณคงเหลือ",
    unit: "หน่วย",
    hazard: "ประเภท/กลุ่มอันตราย",
    location: "สถานที่จัดเก็บ",
    expiry: "วันหมดอายุ",
    sds: "SDS/MSDS",
    status: "สถานะ",
    responsible: "ผู้รับผิดชอบ"
  };

  const ALIASES = {
    id: ["ลำดับ", "เลขที่", "รหัสรายการ", "id", "no", "number"],
    department: ["หน่วยงาน", "แผนก", "กลุ่มงาน", "งานที่ใช้", "สถานที่ใช้งาน", "department", "unit name", "section"],
    chemicalName: ["ชื่อสารเคมี", "สารเคมี", "ชื่อผลิตภัณฑ์", "chemical name", "chemical", "product name", "ชื่อวัตถุอันตราย"],
    tradeName: ["ชื่อทางการค้า", "trade name", "brand", "ยี่ห้อ"],
    cas: ["cas no", "cas number", "cas", "เลข cas", "หมายเลข cas"],
    amount: ["ปริมาณคงเหลือ", "จำนวนคงเหลือ", "คงเหลือ", "ปริมาณ", "จำนวน", "stock", "balance", "quantity"],
    unit: ["หน่วยนับ", "หน่วย", "unit"],
    hazard: ["ประเภทอันตราย", "กลุ่มอันตราย", "ความเป็นอันตราย", "อันตราย", "ghs", "hazard", "hazard class", "ประเภทสารเคมี"],
    location: ["สถานที่จัดเก็บ", "จุดจัดเก็บ", "บริเวณจัดเก็บ", "คลัง", "storage location", "location", "storage"],
    expiry: ["วันหมดอายุ", "วันที่หมดอายุ", "หมดอายุ", "expiry date", "expiration date", "expiry", "expire"],
    sds: ["sds", "msds", "เอกสาร sds", "safety data sheet", "ลิงก์ sds", "url sds"],
    status: ["สถานะ", "status", "สภาพ"],
    responsible: ["ผู้รับผิดชอบ", "ผู้ดูแล", "responsible person", "responsible", "owner"]
  };

  const $ = (id) => document.getElementById(id);
  const text = (value) => String(value ?? "").trim();
  const norm = (value) => text(value)
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[()[\]{}:;,.\/\\_\-–—\s]+/g, "");

  function escapeCsv(value) {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function showToast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function hideLoading() {
    $("loadingScreen").classList.add("hidden");
  }

  function buildSheetUrl() {
    const id = CONFIG.SHEET_ID;
    const gid = CONFIG.SHEET_GID || "0";
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(gid)}&headers=1&_=${Date.now()}`;
  }

  function loadSheetViaJsonp() {
    return new Promise((resolve, reject) => {
      const id = CONFIG.SHEET_ID;
      const gid = CONFIG.SHEET_GID || "0";
      const callbackName = `__dontumSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("หมดเวลารอข้อมูลจาก Google Sheets"));
      }, 20000);

      function cleanup() {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      }

      window[callbackName] = (payload) => {
        try {
          if (!payload || payload.status === "error") {
            const detail = payload?.errors?.[0]?.detailed_message ||
              payload?.errors?.[0]?.message ||
              "Google Sheets ไม่อนุญาตให้เข้าถึงข้อมูล";
            throw new Error(detail);
          }

          const table = payload.table || {};
          const rawHeaders = (table.cols || []).map((col, index) =>
            text(col?.label || col?.id || `คอลัมน์ ${index + 1}`)
          );
          const headers = makeUniqueHeaders(rawHeaders);
          const rows = (table.rows || []).map((row) => {
            const obj = {};
            headers.forEach((header, index) => {
              const cell = row?.c?.[index];
              obj[header] = text(cell?.f ?? cell?.v ?? "");
            });
            return obj;
          }).filter(row => Object.values(row).some(Boolean));

          cleanup();
          resolve({ headers, rows, method: "JSONP" });
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("โหลด Google Sheets ไม่สำเร็จ กรุณาตรวจสิทธิ์การแชร์และค่า gid"));
      };

      script.src =
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq` +
        `?gid=${encodeURIComponent(gid)}&headers=1` +
        `&tqx=responseHandler:${encodeURIComponent(callbackName)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  async function fetchSheetData() {
    try {
      const response = await fetch(buildSheetUrl(), { cache: "no-store" });
      if (!response.ok) throw new Error(`Google Sheets ตอบกลับ ${response.status}`);
      const csv = await response.text();
      if (/<!doctype html>|<html/i.test(csv)) {
        throw new Error("Google Sheets ส่งหน้าล็อกอินกลับมา");
      }
      return { ...parseCsvSmart(csv), method: "CSV" };
    } catch (csvError) {
      console.warn("CSV fetch failed; trying JSONP fallback.", csvError);
      return await loadSheetViaJsonp();
    }
  }

  function headerScore(row) {
    const cells = row.map(norm).filter(Boolean);
    if (!cells.length) return 0;
    let score = 0;
    for (const aliases of Object.values(ALIASES)) {
      if (cells.some(cell => aliases.some(alias => {
        const a = norm(alias);
        return cell === a || (a.length >= 4 && cell.includes(a));
      }))) score += 1;
    }
    return score;
  }

  function makeUniqueHeaders(headers) {
    const seen = new Map();
    return headers.map((h, index) => {
      let base = text(h) || `คอลัมน์ ${index + 1}`;
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count ? `${base} (${count + 1})` : base;
    });
  }

  function parseCsvSmart(csvText) {
    const parsed = Papa.parse(csvText, {
      header: false,
      skipEmptyLines: false
    });
    if (parsed.errors?.length && !parsed.data?.length) {
      throw new Error(parsed.errors[0].message || "ไม่สามารถอ่าน CSV ได้");
    }

    const matrix = (parsed.data || [])
      .map(row => row.map(text))
      .filter(row => row.some(Boolean));

    if (!matrix.length) return { headers: [], rows: [] };

    let headerIndex = 0;
    let bestScore = -1;
    matrix.slice(0, 15).forEach((row, index) => {
      const score = headerScore(row);
      if (score > bestScore) {
        bestScore = score;
        headerIndex = index;
      }
    });

    const headers = makeUniqueHeaders(matrix[headerIndex]);
    const rows = matrix.slice(headerIndex + 1)
      .filter(row => row.some(Boolean))
      .map(row => {
        const obj = {};
        headers.forEach((header, i) => obj[header] = text(row[i]));
        return obj;
      });

    return { headers, rows };
  }

  function findHeader(headers, aliases) {
    const normalizedHeaders = headers.map(h => ({ original: h, normalized: norm(h) }));
    const normalizedAliases = aliases.map(norm);

    for (const alias of normalizedAliases) {
      const exact = normalizedHeaders.find(h => h.normalized === alias);
      if (exact) return exact.original;
    }
    for (const alias of normalizedAliases.filter(a => a.length >= 4)) {
      const partial = normalizedHeaders.find(h => h.normalized.includes(alias) || alias.includes(h.normalized));
      if (partial) return partial.original;
    }
    return "";
  }

  function detectMapping(headers) {
    const mapping = {};
    for (const [field, aliases] of Object.entries(ALIASES)) {
      mapping[field] = findHeader(headers, aliases);
    }
    return mapping;
  }

  function value(row, field) {
    const header = state.mapping[field];
    return header ? text(row[header]) : "";
  }

  function parseDate(valueInput) {
    const raw = text(valueInput);
    if (!raw) return null;

    if (/^\d{4,5}(\.\d+)?$/.test(raw)) {
      const serial = Number(raw);
      if (serial > 20000 && serial < 80000) {
        const utcDays = Math.floor(serial - 25569);
        const date = new Date(utcDays * 86400 * 1000);
        return isNaN(date) ? null : new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
      }
    }

    const clean = raw.replace(/\./g, "/").replace(/-/g, "/").trim();
    let m = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let day = Number(m[1]), month = Number(m[2]) - 1, year = Number(m[3]);
      if (year < 100) year += year < 70 ? 2000 : 1900;
      if (year > 2400) year -= 543;
      const date = new Date(year, month, day);
      return isNaN(date) ? null : date;
    }

    m = clean.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (m) {
      let year = Number(m[1]);
      if (year > 2400) year -= 543;
      const date = new Date(year, Number(m[2]) - 1, Number(m[3]));
      return isNaN(date) ? null : date;
    }

    const date = new Date(raw);
    return isNaN(date) ? null : date;
  }

  function expiryInfo(rawDate) {
    const date = parseDate(rawDate);
    if (!date) return { key: "unknown", label: "ไม่ระบุ", date: null, days: null };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const days = Math.ceil((date - today) / 86400000);
    const warningDays = Number(CONFIG.EXPIRY_WARNING_DAYS || 90);

    if (days < 0) return { key: "expired", label: "หมดอายุแล้ว", date, days };
    if (days <= warningDays) return { key: "warning", label: `ใกล้หมดอายุ (${days} วัน)`, date, days };
    return { key: "active", label: "ยังไม่หมดอายุ", date, days };
  }

  function formatDate(date, fallback = "–") {
    if (!date) return fallback;
    return new Intl.DateTimeFormat("th-TH", {
      day: "2-digit", month: "2-digit", year: "numeric"
    }).format(date);
  }

  function normalizeRow(row, index) {
    const expiryRaw = value(row, "expiry");
    const expiry = expiryInfo(expiryRaw);
    const chemicalName = value(row, "chemicalName") || value(row, "tradeName") || "ไม่ระบุชื่อ";
    return {
      index: value(row, "id") || String(index + 1),
      department: value(row, "department") || "ไม่ระบุหน่วยงาน",
      chemicalName,
      tradeName: value(row, "tradeName"),
      cas: value(row, "cas"),
      amount: value(row, "amount"),
      unit: value(row, "unit"),
      hazard: value(row, "hazard") || "ไม่ระบุ",
      location: value(row, "location") || "ไม่ระบุ",
      expiryRaw,
      expiry,
      sds: value(row, "sds"),
      status: value(row, "status"),
      responsible: value(row, "responsible"),
      original: row,
      searchBlob: Object.values(row).join(" ").toLowerCase()
    };
  }

  function uniqueSorted(values) {
    return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  }

  function fillSelect(id, values, allLabel) {
    const select = $(id);
    const current = select.value;
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = allLabel;
    select.appendChild(all);
    values.forEach(item => {
      const option = document.createElement("option");
      option.value = item;
      option.textContent = item;
      select.appendChild(option);
    });
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function populateFilters() {
    fillSelect("departmentFilter", uniqueSorted(state.rows.map(r => r.department)), "ทุกหน่วยงาน");
    fillSelect("hazardFilter", uniqueSorted(state.rows.map(r => r.hazard)), "ทุกประเภท");
    fillSelect("locationFilter", uniqueSorted(state.rows.map(r => r.location)), "ทุกสถานที่");
  }

  function filterRows() {
    const q = $("searchInput").value.trim().toLowerCase();
    const department = $("departmentFilter").value;
    const hazard = $("hazardFilter").value;
    const expiry = $("expiryFilter").value;
    const location = $("locationFilter").value;

    state.filtered = state.rows.filter(row =>
      (!q || row.searchBlob.includes(q)) &&
      (!department || row.department === department) &&
      (!hazard || row.hazard === hazard) &&
      (!expiry || row.expiry.key === expiry) &&
      (!location || row.location === location)
    );
    state.page = 1;
    render();
  }

  function countBy(rows, getter) {
    const map = new Map();
    rows.forEach(row => {
      const key = text(getter(row)) || "ไม่ระบุ";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function setKpis(rows) {
    $("kpiTotal").textContent = rows.length.toLocaleString("th-TH");
    $("kpiUnique").textContent = new Set(rows.map(r => norm(r.chemicalName)).filter(Boolean)).size.toLocaleString("th-TH");
    $("kpiDepartments").textContent = new Set(rows.map(r => r.department).filter(Boolean)).size.toLocaleString("th-TH");
    $("kpiWarning").textContent = rows.filter(r => r.expiry.key === "warning").length.toLocaleString("th-TH");
    $("kpiExpired").textContent = rows.filter(r => r.expiry.key === "expired").length.toLocaleString("th-TH");
    $("resultCount").textContent = rows.length.toLocaleString("th-TH");

    const expired = rows.filter(r => r.expiry.key === "expired").length;
    const warning = rows.filter(r => r.expiry.key === "warning").length;
    const banner = $("alertBanner");
    if (expired || warning) {
      banner.hidden = false;
      banner.innerHTML = `<strong>รายการที่ควรติดตาม:</strong> หมดอายุแล้ว ${expired.toLocaleString("th-TH")} รายการ และใกล้หมดอายุ ${warning.toLocaleString("th-TH")} รายการ`;
    } else {
      banner.hidden = true;
      banner.textContent = "";
    }
  }

  function destroyChart(id) {
    if (state.charts[id]) state.charts[id].destroy();
  }

  function createChart(id, type, labels, values, datasetLabel, horizontal = false) {
    destroyChart(id);
    const canvas = $(id);
    state.charts[id] = new Chart(canvas, {
      type,
      data: {
        labels,
        datasets: [{
          label: datasetLabel,
          data: values,
          borderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        plugins: {
          legend: { display: type === "doughnut" },
          tooltip: {
            callbacks: {
              label: context => `${context.label || datasetLabel}: ${Number(context.raw || 0).toLocaleString("th-TH")}`
            }
          }
        },
        scales: type === "doughnut" ? {} : {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }

  function renderCharts(rows) {
    const departments = countBy(rows, r => r.department).slice(0, 10);
    createChart("departmentChart", "bar", departments.map(x => x[0]), departments.map(x => x[1]), "จำนวนรายการ", true);

    const expiryOrder = [
      ["active", "ยังไม่หมดอายุ"],
      ["warning", "ใกล้หมดอายุ"],
      ["expired", "หมดอายุแล้ว"],
      ["unknown", "ไม่ระบุวันหมดอายุ"]
    ];
    const expiryCounts = expiryOrder.map(([key]) => rows.filter(r => r.expiry.key === key).length);
    createChart("expiryChart", "doughnut", expiryOrder.map(x => x[1]), expiryCounts, "จำนวนรายการ");

    const chemicals = countBy(rows, r => r.chemicalName).slice(0, 10);
    createChart("chemicalChart", "bar", chemicals.map(x => x[0]), chemicals.map(x => x[1]), "จำนวนรายการ", true);

    const total = rows.length || 1;
    const quality = [
      ["มี CAS No.", rows.filter(r => Boolean(r.cas)).length],
      ["มี SDS/MSDS", rows.filter(r => Boolean(r.sds)).length],
      ["มีวันหมดอายุ", rows.filter(r => Boolean(r.expiryRaw)).length],
      ["มีสถานที่จัดเก็บ", rows.filter(r => r.location && r.location !== "ไม่ระบุ").length]
    ];
    createChart(
      "qualityChart",
      "bar",
      quality.map(x => x[0]),
      quality.map(x => Math.round((x[1] / total) * 100)),
      "ร้อยละความครบถ้วน"
    );
  }

  function createCell(content, className = "") {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = content || "–";
    return td;
  }

  function renderTable(rows) {
    const tbody = $("chemicalTableBody");
    tbody.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 10;
      td.className = "empty-state";
      td.textContent = "ไม่พบข้อมูลตามเงื่อนไขที่เลือก";
      tr.appendChild(td);
      tbody.appendChild(tr);
      $("pagination").innerHTML = "";
      return;
    }

    const pageSize = Number(CONFIG.PAGE_SIZE || 25);
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * pageSize;
    const current = rows.slice(start, start + pageSize);

    current.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.appendChild(createCell(String(start + i + 1)));
      tr.appendChild(createCell(row.department));
      tr.appendChild(createCell(row.tradeName && row.tradeName !== row.chemicalName
        ? `${row.chemicalName} (${row.tradeName})`
        : row.chemicalName, "name-cell"));
      tr.appendChild(createCell(row.cas));
      tr.appendChild(createCell([row.amount, row.unit].filter(Boolean).join(" "), "amount"));
      tr.appendChild(createCell(row.hazard));
      tr.appendChild(createCell(row.location));
      tr.appendChild(createCell(formatDate(row.expiry.date, row.expiryRaw || "–")));

      const statusTd = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `badge ${row.expiry.key}`;
      badge.textContent = row.expiry.label;
      statusTd.appendChild(badge);
      tr.appendChild(statusTd);

      const sdsTd = document.createElement("td");
      if (/^https?:\/\//i.test(row.sds)) {
        const link = document.createElement("a");
        link.href = row.sds;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "sds-link";
        link.textContent = "เปิด SDS";
        sdsTd.appendChild(link);
      } else if (row.sds) {
        const sdsBadge = document.createElement("span");
        sdsBadge.className = "badge active";
        sdsBadge.textContent = row.sds;
        sdsTd.appendChild(sdsBadge);
      } else {
        sdsTd.textContent = "–";
        sdsTd.className = "muted";
      }
      tr.appendChild(sdsTd);
      tbody.appendChild(tr);
    });

    renderPagination(pageCount);
  }

  function renderPagination(pageCount) {
    const wrap = $("pagination");
    wrap.innerHTML = "";
    if (pageCount <= 1) return;

    const makeButton = (label, page, disabled = false, active = false) => {
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
      return button;
    };

    wrap.appendChild(makeButton("‹", Math.max(1, state.page - 1), state.page === 1));
    const start = Math.max(1, state.page - 2);
    const end = Math.min(pageCount, start + 4);
    for (let page = start; page <= end; page++) {
      wrap.appendChild(makeButton(String(page), page, false, page === state.page));
    }
    wrap.appendChild(makeButton("›", Math.min(pageCount, state.page + 1), state.page === pageCount));
  }

  function renderMapping() {
    const grid = $("mappingGrid");
    grid.innerHTML = "";
    Object.entries(FIELD_LABELS).forEach(([field, label]) => {
      const item = document.createElement("div");
      const header = state.mapping[field];
      item.className = `mapping-item${header ? "" : " missing"}`;
      const span = document.createElement("span");
      span.textContent = label;
      const b = document.createElement("b");
      b.textContent = header || "ไม่พบคอลัมน์";
      item.append(span, b);
      grid.appendChild(item);
    });
  }

  function render() {
    setKpis(state.filtered);
    renderCharts(state.filtered);
    renderTable(state.filtered);
    renderMapping();
  }

  function clearFilters() {
    $("searchInput").value = "";
    $("departmentFilter").value = "";
    $("hazardFilter").value = "";
    $("expiryFilter").value = "";
    $("locationFilter").value = "";
    state.filtered = [...state.rows];
    state.page = 1;
    render();
  }

  function exportFilteredCsv() {
    const headers = [
      "ลำดับ", "หน่วยงาน", "ชื่อสารเคมี", "ชื่อทางการค้า", "CAS No.",
      "ปริมาณคงเหลือ", "หน่วย", "ประเภทอันตราย", "สถานที่จัดเก็บ",
      "วันหมดอายุ", "สถานะวันหมดอายุ", "SDS"
    ];
    const lines = [headers.map(escapeCsv).join(",")];
    state.filtered.forEach((row, i) => {
      lines.push([
        i + 1, row.department, row.chemicalName, row.tradeName, row.cas,
        row.amount, row.unit, row.hazard, row.location,
        row.expiryRaw, row.expiry.label, row.sds
      ].map(escapeCsv).join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dontum-chemicals-filtered-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadData(showMessage = true) {
    $("sourceStatus").textContent = "กำลังเชื่อมต่อ Google Sheets…";
    if (showMessage) $("loadingScreen").classList.remove("hidden");

    try {
      const parsed = await fetchSheetData();
      state.headers = parsed.headers;
      state.rawRows = parsed.rows;
      state.mapping = detectMapping(parsed.headers);
      state.rows = parsed.rows
        .map(normalizeRow)
        .filter(row => row.chemicalName !== "ไม่ระบุชื่อ" || row.cas || row.amount || row.department !== "ไม่ระบุหน่วยงาน");
      state.filtered = [...state.rows];
      state.page = 1;

      populateFilters();
      render();

      const now = new Intl.DateTimeFormat("th-TH", {
        dateStyle: "short", timeStyle: "short"
      }).format(new Date());
      $("lastUpdated").textContent = now;
      $("sourceStatus").textContent = `เชื่อมต่อ Google Sheets สำเร็จ (${parsed.method || "อัตโนมัติ"}) • ${state.rows.length.toLocaleString("th-TH")} รายการ`;
      if (showMessage) showToast("โหลดข้อมูลจาก Google Sheets สำเร็จ");
    } catch (error) {
      console.error(error);
      $("sourceStatus").textContent = "ไม่สามารถโหลด Google Sheets ได้";
      $("alertBanner").hidden = false;
      $("alertBanner").innerHTML =
        `<strong>เชื่อมต่อข้อมูลไม่สำเร็จ:</strong> ${text(error.message)}<br>` +
        `ตรวจสอบการแชร์ไฟล์ Google Sheet และค่า SHEET_GID ใน assets/config.js`;
      showToast("ไม่สามารถโหลดข้อมูลได้");
    } finally {
      hideLoading();
    }
  }

  function bindEvents() {
    $("refreshBtn").addEventListener("click", () => loadData(true));
    $("clearFiltersBtn").addEventListener("click", clearFilters);
    $("exportBtn").addEventListener("click", exportFilteredCsv);
    $("searchInput").addEventListener("input", filterRows);
    ["departmentFilter", "hazardFilter", "expiryFilter", "locationFilter"]
      .forEach(id => $(id).addEventListener("change", filterRows));
  }

  function init() {
    $("warningDaysLabel").textContent = `ภายใน ${Number(CONFIG.EXPIRY_WARNING_DAYS || 90).toLocaleString("th-TH")} วัน`;
    bindEvents();
    loadData(false);

    const minutes = Number(CONFIG.AUTO_REFRESH_MINUTES || 0);
    if (minutes > 0) {
      setInterval(() => loadData(false), minutes * 60 * 1000);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
