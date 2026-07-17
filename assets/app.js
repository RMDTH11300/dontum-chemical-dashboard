(() => {
  "use strict";

  const CONFIG = window.CHEMICAL_APP_CONFIG || {};
  const FALLBACK = Array.isArray(window.CHEMICAL_DATA) ? window.CHEMICAL_DATA : [];
  const SOURCE = window.CHEMICAL_SOURCE_SUMMARY || {};
  const CATALOG = Array.isArray(window.SDS_IMAGE_CATALOG) ? window.SDS_IMAGE_CATALOG : [];

  const ROW_IMAGE_MAP = {
    "001":"001","002":"002","003":"047","006":"022","008":"058",
    "009":"005","010":"005","011":"043","030":"068","032":"008",
    "041":"010","042":"010","045":"079","051":"011","064":"013",
    "068":"012","070":"019","079":"044","086":"001","088":"007",
    "090":"080"
  };

  const BLOCK_AUTO_MATCH = new Set([
    "004","005","007","021","023","034","037","048","050","052",
    "067","087","089"
  ]);

  const state = {
    rows: [], filtered: [], page: 1, charts: {},
    source: "embedded", galleryHidden: false
  };

  const $ = id => document.getElementById(id);
  const text = value => String(value ?? "").trim();
  const normalize = value => text(value)
    .toLowerCase()
    .replace(/formalin/g, "formaldehyde")
    .replace(/ethyl alcohol/g, "ethanol")
    .replace(/iso\s*propyl/g, "isopropyl")
    .replace(/peracetic/g, "peroxyacetic")
    .replace(/[()[\]{}:,/\\_\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const apiReady = () => Boolean(
    CONFIG.API_ENABLED &&
    /^https:\/\/script\.google\.com\//.test(text(CONFIG.API_URL))
  );

  function showToast(message) {
    const element = $("toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => element.classList.remove("show"), 2600);
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  }

  function fill(id, values, label) {
    const select = $(id);
    const current = select.value;
    select.innerHTML = `<option value="">${label}</option>`;
    values.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === current)) {
      select.value = current;
    }
  }

  function setupFilters() {
    fill("departmentFilter", unique(state.rows.map(row => row.department)), "ทุกหน่วยงาน");
    fill("hazardFilter", unique(state.rows.flatMap(row => row.hazards || [])), "ทุกประเภท");
    fill("ppeFilter", unique(state.rows.flatMap(row => row.ppe || [])), "ทุกประเภท");
  }

  function completeness(row, type) {
    if (!type) return true;
    if (type === "complete") return Boolean(row.storage && row.use);
    if (type === "missing-storage") return !row.storage;
    if (type === "missing-use") return !row.use;
    if (type === "missing-ppe") return !(row.ppe || []).length;
    return true;
  }

  function applyFilters(options = {}) {
    const query = normalize($("searchInput").value);
    const department = $("departmentFilter").value;
    const hazard = $("hazardFilter").value;
    const ppe = $("ppeFilter").value;
    const completenessType = $("completenessFilter").value;

    state.filtered = state.rows.filter(row => {
      const blob = normalize([
        row.department, row.code, row.chemicalName, row.tradeName,
        row.quantity, row.storage, row.use,
        ...(row.hazards || []), ...(row.ppe || [])
      ].join(" "));

      return (!query || blob.includes(query))
        && (!department || row.department === department)
        && (!hazard || (row.hazards || []).includes(hazard))
        && (!ppe || (row.ppe || []).includes(ppe))
        && completeness(row, completenessType);
    });

    state.page = 1;
    state.galleryHidden = false;
    render();

    if (options.scrollGallery && !$("chemicalGalleryPanel").hidden) {
      $("chemicalGalleryPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function clearFilters() {
    ["searchInput", "departmentFilter", "hazardFilter", "ppeFilter", "completenessFilter"]
      .forEach(id => $(id).value = "");
    state.filtered = [...state.rows];
    state.page = 1;
    state.galleryHidden = false;
    render();
  }

  function countBy(values) {
    const map = new Map();
    values.forEach(value => {
      if (value) map.set(value, (map.get(value) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function updateKpis(rows) {
    $("kpiRecords").textContent = rows.length.toLocaleString("th-TH");
    $("kpiUnique").textContent =
      new Set(rows.map(row => normalize(row.chemicalName)).filter(Boolean)).size.toLocaleString("th-TH");
    $("kpiDepartments").textContent =
      new Set(rows.map(row => row.department).filter(Boolean)).size.toLocaleString("th-TH");
    $("kpiHazard").textContent =
      rows.filter(row => (row.hazards || []).length).length.toLocaleString("th-TH");
    $("kpiPpe").textContent =
      rows.filter(row => (row.ppe || []).length).length.toLocaleString("th-TH");
    $("resultCount").textContent = rows.length.toLocaleString("th-TH");
  }

  function chart(id, type, labels, values, label, horizontal = false) {
    if (typeof Chart === "undefined") return;
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
    let values = countBy(rows.map(row => row.department));
    chart("departmentChart", "bar", values.map(x => x[0]), values.map(x => x[1]), "จำนวนรายการ", true);

    values = countBy(rows.flatMap(row => row.hazards || []));
    chart("hazardChart", "bar", values.map(x => x[0]), values.map(x => x[1]), "จำนวนรายการ", true);

    values = countBy(rows.flatMap(row => row.ppe || []));
    chart("ppeChart", "bar", values.map(x => x[0]), values.map(x => x[1]), "จำนวนรายการ");

    const total = rows.length || 1;
    const quality = [
      ["มีรหัส", rows.filter(row => row.code).length],
      ["มีปริมาณ", rows.filter(row => row.quantity).length],
      ["มีสถานที่เก็บ", rows.filter(row => row.storage).length],
      ["มีการใช้ประโยชน์", rows.filter(row => row.use).length],
      ["มี PPE", rows.filter(row => (row.ppe || []).length).length]
    ];
    chart(
      "qualityChart", "bar",
      quality.map(x => x[0]),
      quality.map(x => Math.round((x[1] / total) * 100)),
      "ร้อยละ"
    );
  }

  function codeKey(code) {
    const match = text(code).match(/\d+/);
    return match ? match[0].padStart(3, "0").slice(-3) : "";
  }

  function catalogById(id) {
    return CATALOG.find(item => item.id === id) || null;
  }

  function percentValues(value) {
    return [...normalize(value).matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
      .map(match => Number(match[1]))
      .filter(Number.isFinite);
  }

  function meaningfulTokens(value) {
    const stop = new Set([
      "solution","liquid","compound","neutral","sheets","scrub","hand",
      "sanitizer","glacial","monohydrate","pentahydrate","maxwhite",
      "bleach","md","w","v","the","and"
    ]);
    return new Set(
      normalize(value)
        .replace(/\d+(?:\.\d+)?\s*%/g, " ")
        .replace(/\d+/g, " ")
        .split(" ")
        .filter(token => token.length > 2 && !stop.has(token))
    );
  }

  function autoMatchImage(row) {
    const rowCode = codeKey(row.code);
    if (BLOCK_AUTO_MATCH.has(rowCode)) return null;

    const sourceText = `${row.chemicalName || ""} ${row.tradeName || ""}`;
    const sourceTokens = meaningfulTokens(sourceText);
    if (!sourceTokens.size) return null;
    const sourcePercents = percentValues(sourceText);

    let best = null;
    let bestScore = 0;

    CATALOG.forEach(item => {
      const itemTokens = meaningfulTokens(item.title);
      const shared = [...sourceTokens].filter(token => itemTokens.has(token));
      if (!shared.length) return;

      const itemPercents = percentValues(item.title);
      if (sourcePercents.length && itemPercents.length) {
        const closest = Math.min(...sourcePercents.flatMap(a => itemPercents.map(b => Math.abs(a - b))));
        if (closest > 1.5) return;
      }

      const union = new Set([...sourceTokens, ...itemTokens]);
      const score = shared.length / union.size;
      const singleStrong = shared.length === 1 &&
        ["acetone","edta","formaldehyde","chlorhexidine","hypochlorite","peroxide"].includes(shared[0]);

      if ((shared.length >= 2 || singleStrong) && score > bestScore) {
        bestScore = score;
        best = item;
      }
    });

    return bestScore >= 0.34 ? best : null;
  }

  function imageForRow(row) {
    const rowCode = codeKey(row.code);
    if (Object.prototype.hasOwnProperty.call(ROW_IMAGE_MAP, rowCode)) {
      return catalogById(ROW_IMAGE_MAP[rowCode]);
    }
    return autoMatchImage(row);
  }

  function renderDepartmentButtons() {
    const wrap = $("departmentButtons");
    wrap.innerHTML = "";
    const selected = $("departmentFilter").value;
    countBy(state.rows.map(row => row.department)).forEach(([department, count]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `department-button${selected === department ? " active" : ""}`;

      const name = document.createElement("span");
      name.textContent = department;
      const countBadge = document.createElement("span");
      countBadge.className = "count";
      countBadge.textContent = count.toLocaleString("th-TH");

      button.append(name, countBadge);
      button.addEventListener("click", () => {
        $("departmentFilter").value = department;
        applyFilters({ scrollGallery: true });
      });
      wrap.appendChild(button);
    });
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

  function renderGallery() {
    const panel = $("chemicalGalleryPanel");
    const grid = $("chemicalCardGrid");
    const query = text($("searchInput").value);
    const department = $("departmentFilter").value;
    const shouldShow = !state.galleryHidden && Boolean(query || department);

    panel.hidden = !shouldShow;
    if (!shouldShow) return;

    grid.innerHTML = "";
    const rows = state.filtered.slice(0, 48);
    $("galleryTitle").textContent = department
      ? `สารเคมีของหน่วยงาน ${department}`
      : `ผลการค้นหา “${query}”`;
    $("gallerySummary").textContent =
      `พบ ${state.filtered.length.toLocaleString("th-TH")} รายการ` +
      (state.filtered.length > 48 ? " • แสดง 48 รายการแรก" : "");

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "gallery-empty";
      empty.textContent = "ไม่พบรายการสารเคมีในทะเบียนตามเงื่อนไขนี้";
      grid.appendChild(empty);
      return;
    }

    rows.forEach(row => {
      const image = imageForRow(row);
      const card = document.createElement("article");
      card.className = "chemical-card";

      const imageButton = document.createElement("button");
      imageButton.type = "button";
      imageButton.className = "chemical-card-image";
      imageButton.setAttribute("aria-label", `ดูรายละเอียด ${row.chemicalName}`);

      if (image) {
        const img = document.createElement("img");
        img.src = image.image;
        img.alt = `SDS ${image.title}`;
        img.loading = "lazy";
        imageButton.appendChild(img);

        const status = document.createElement("span");
        status.className = "image-status";
        status.textContent = image.sdsCode;
        imageButton.appendChild(status);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "image-placeholder";
        placeholder.innerHTML =
          `<strong>CH</strong><span>ยังไม่มีภาพ SDS<br>ที่จับคู่ตรงกับรายการนี้</span>`;
        imageButton.appendChild(placeholder);
      }
      imageButton.addEventListener("click", () => openRowDetail(row, image));

      const body = document.createElement("div");
      body.className = "chemical-card-body";

      const dept = document.createElement("button");
      dept.type = "button";
      dept.className = "card-department";
      dept.textContent = row.department || "ไม่ระบุหน่วยงาน";
      dept.addEventListener("click", () => {
        $("departmentFilter").value = row.department || "ไม่ระบุหน่วยงาน";
        applyFilters({ scrollGallery: true });
      });

      const heading = document.createElement("h4");
      const titleButton = document.createElement("button");
      titleButton.type = "button";
      titleButton.className = "chemical-card-title";
      titleButton.textContent = row.chemicalName || "ไม่ระบุชื่อ";
      titleButton.addEventListener("click", () => openRowDetail(row, image));
      heading.appendChild(titleButton);

      body.append(dept, heading);

      if (row.tradeName) {
        const trade = document.createElement("div");
        trade.className = "card-trade";
        trade.textContent = row.tradeName;
        body.appendChild(trade);
      }

      const data = document.createElement("dl");
      data.className = "card-data";
      const pairs = [
        ["รหัส", row.code],
        ["ปริมาณ", row.quantity],
        ["สถานที่เก็บ", row.storage],
        ["การใช้", row.use],
      ];
      pairs.forEach(([label, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value || "–";
        data.append(dt, dd);
      });
      body.appendChild(data);

      const actions = document.createElement("div");
      actions.className = "card-actions";
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "btn primary small";
      detailButton.textContent = image ? "ดูภาพและรายละเอียด" : "ดูรายละเอียด";
      detailButton.addEventListener("click", () => openRowDetail(row, image));
      actions.appendChild(detailButton);
      body.appendChild(actions);

      card.append(imageButton, body);
      grid.appendChild(card);
    });
  }

  function catalogMatches(query) {
    const normalizedQuery = normalize(query);
    if (normalizedQuery.length < 2) return [];
    const queryTokens = meaningfulTokens(normalizedQuery);

    return CATALOG
      .map(item => {
        const normalizedTitle = normalize(`${item.id} ${item.sdsCode} ${item.title}`);
        const titleTokens = meaningfulTokens(item.title);
        const shared = [...queryTokens].filter(token => titleTokens.has(token)).length;
        const score = normalizedTitle.includes(normalizedQuery) ? 100 : shared;
        return { item, score };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
      .slice(0, 30)
      .map(result => result.item);
  }

  function renderSdsLibrarySearch() {
    const panel = $("sdsLibraryPanel");
    const grid = $("sdsLibraryGrid");
    const query = text($("searchInput").value);
    const matches = catalogMatches(query);

    panel.hidden = !query || !matches.length;
    grid.innerHTML = "";
    if (panel.hidden) return;

    $("sdsLibrarySummary").textContent =
      `พบภาพ SDS ${matches.length.toLocaleString("th-TH")} ภาพที่เกี่ยวข้องกับ “${query}”`;

    matches.forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sds-library-card";

      const image = document.createElement("img");
      image.src = item.image;
      image.alt = item.title;
      image.loading = "lazy";

      const information = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = item.title;
      const code = document.createElement("span");
      code.textContent = item.sdsCode;
      information.append(title, code);

      button.append(image, information);
      button.addEventListener("click", () => openCatalogDetail(item));
      grid.appendChild(button);
    });
  }

  function modalImage(image) {
    const wrap = $("detailImageWrap");
    wrap.innerHTML = "";
    if (image) {
      const img = document.createElement("img");
      img.src = image.image;
      img.alt = image.title;
      wrap.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "image-placeholder";
      placeholder.innerHTML =
        "<strong>CH</strong><span>ยังไม่มีภาพ SDS ที่ตรงกับสารเคมีรายการนี้</span>";
      wrap.appendChild(placeholder);
    }
  }

  function appendDetailSection(title, pairs, extraNode = null) {
    const section = document.createElement("section");
    section.className = "detail-section";
    const heading = document.createElement("h4");
    heading.textContent = title;
    section.appendChild(heading);

    if (pairs && pairs.length) {
      const dl = document.createElement("dl");
      dl.className = "detail-grid";
      pairs.forEach(([label, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value || "–";
        dl.append(dt, dd);
      });
      section.appendChild(dl);
    }

    if (extraNode) section.appendChild(extraNode);
    $("detailInformation").appendChild(section);
  }

  function openRowDetail(row, image) {
    $("detailModalTitle").textContent = row.chemicalName || "รายละเอียดสารเคมี";
    $("detailInformation").innerHTML = "";
    modalImage(image);

    appendDetailSection("ข้อมูลทะเบียนสารเคมี", [
      ["หน่วยงาน", row.department],
      ["ลำดับ/รหัส", row.code],
      ["ชื่อสารเคมี", row.chemicalName],
      ["ชื่อการค้า", row.tradeName],
      ["ปริมาณ", row.quantity],
      ["สถานที่เก็บ", row.storage],
      ["การใช้ประโยชน์", row.use],
    ]);

    const hazardNode = badgeList(row.hazards, "hazard");
    appendDetailSection("ความเป็นอันตราย", [], hazardNode);

    const ppeNode = badgeList(row.ppe, "ppe");
    appendDetailSection("อุปกรณ์ป้องกันส่วนบุคคล", [], ppeNode);

    if (image) {
      appendDetailSection("ภาพ SDS ที่จับคู่", [
        ["รหัสภาพ", image.sdsCode],
        ["ชื่อบนภาพ", image.title],
      ]);
    } else {
      const note = document.createElement("div");
      note.className = "detail-note";
      note.textContent =
        "ยังไม่พบภาพ SDS ในชุดที่แนบมาซึ่งตรงกับชื่อและความเข้มข้นของสารรายการนี้ จึงไม่แสดงภาพอื่นแทนเพื่อป้องกันข้อมูลคลาดเคลื่อน";
      $("detailInformation").appendChild(note);
    }

    openModal();
  }

  function openCatalogDetail(item) {
    $("detailModalTitle").textContent = item.title;
    $("detailInformation").innerHTML = "";
    modalImage(item);
    appendDetailSection("ข้อมูลภาพ SDS", [
      ["รหัสภาพ", item.sdsCode],
      ["ชื่อสารเคมี", item.title],
    ]);

    const note = document.createElement("div");
    note.className = "detail-note";
    note.textContent =
      "ภาพนี้มาจากคลังภาพ SDS ที่แนบมา การแสดงในส่วนนี้ไม่ได้หมายความว่าภาพถูกจับคู่กับรายการใดรายการหนึ่งในทะเบียนโดยอัตโนมัติ";
    $("detailInformation").appendChild(note);
    openModal();
  }

  function openModal() {
    $("detailModal").classList.add("open");
    $("detailModal").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("detailModal").classList.remove("open");
    $("detailModal").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function makeCell(value, className = "") {
    const td = document.createElement("td");
    td.textContent = value || "–";
    if (className) td.className = className;
    return td;
  }

  function renderTable(rows) {
    const body = $("tableBody");
    body.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 9;
      td.className = "empty";
      td.textContent = "ไม่พบข้อมูลตามเงื่อนไขที่เลือก";
      tr.appendChild(td);
      body.appendChild(tr);
      $("pagination").innerHTML = "";
      return;
    }

    const pageSize = Number(CONFIG.PAGE_SIZE || 25);
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * pageSize;

    rows.slice(start, start + pageSize).forEach((row, index) => {
      const image = imageForRow(row);
      const tr = document.createElement("tr");
      tr.appendChild(makeCell(String(start + index + 1)));

      const departmentCell = document.createElement("td");
      const departmentButton = document.createElement("button");
      departmentButton.type = "button";
      departmentButton.className = "department-link";
      departmentButton.textContent = row.department || "ไม่ระบุหน่วยงาน";
      departmentButton.addEventListener("click", () => {
        $("departmentFilter").value = row.department || "ไม่ระบุหน่วยงาน";
        applyFilters({ scrollGallery: true });
      });
      departmentCell.appendChild(departmentButton);
      tr.appendChild(departmentCell);

      tr.appendChild(makeCell(row.code));

      const nameCell = document.createElement("td");
      nameCell.className = "name-cell";
      const nameButton = document.createElement("button");
      nameButton.type = "button";
      nameButton.className = "chemical-link";
      nameButton.textContent = row.chemicalName || "ไม่ระบุชื่อ";
      nameButton.addEventListener("click", () => openRowDetail(row, image));
      nameCell.appendChild(nameButton);

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

      body.appendChild(tr);
    });

    renderPagination(pages);
  }

  function renderPagination(pages) {
    const wrap = $("pagination");
    wrap.innerHTML = "";
    if (pages <= 1) return;

    const add = (label, page, disabled = false, active = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `page-btn${active ? " active" : ""}`;
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener("click", () => {
        state.page = page;
        renderTable(state.filtered);
        document.querySelector(".table-panel")
          .scrollIntoView({ behavior: "smooth", block: "start" });
      });
      wrap.appendChild(button);
    };

    add("‹", Math.max(1, state.page - 1), state.page === 1);
    const first = Math.max(1, Math.min(state.page - 2, pages - 4));
    const last = Math.min(pages, first + 4);
    for (let page = first; page <= last; page++) {
      add(String(page), page, false, page === state.page);
    }
    add("›", Math.min(pages, state.page + 1), state.page === pages);
  }

  function escapeCsv(value) {
    const string = String(value ?? "");
    return /[",\n]/.test(string)
      ? `"${string.replace(/"/g, '""')}"`
      : string;
  }

  function exportCsv() {
    const headers = [
      "หน่วยงาน","รหัสสารเคมี","ชื่อสารเคมี","Trade Name",
      "ปริมาณ","สถานที่เก็บ","การใช้ประโยชน์","ความเป็นอันตราย","PPE"
    ];
    const rows = state.filtered.map(row => [
      row.department, row.code, row.chemicalName, row.tradeName,
      row.quantity, row.storage, row.use,
      (row.hazards || []).join(" | "),
      (row.ppe || []).join(" | ")
    ]);

    const blob = new Blob(
      ["\ufeff" + [headers, ...rows].map(row => row.map(escapeCsv).join(",")).join("\n")],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dontum-chemical-filtered.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function fetchApi() {
    const response = await fetch(
      `${CONFIG.API_URL}?action=list&_=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.rows)) {
      throw new Error(data.message || "รูปแบบข้อมูลไม่ถูกต้อง");
    }
    return data.rows;
  }

  async function load(showMessage = true) {
    const banner = $("statusBanner");
    try {
      let rows;
      if (apiReady()) {
        rows = await fetchApi();
        state.source = "api";
        $("dataSourceNote").innerHTML =
          "<b>แหล่งข้อมูล</b><span>Google Apps Script / Google Sheet</span>";
        banner.hidden = true;
      } else {
        rows = FALLBACK;
        state.source = "embedded";
        $("dataSourceNote").innerHTML =
          "<b>แหล่งข้อมูล</b><span>ข้อมูลตั้งต้นจากไฟล์ Excel</span>";
        banner.className = "status-banner warning";
        banner.hidden = false;
        banner.textContent =
          "ยังไม่ได้เชื่อม Google Apps Script จึงกำลังแสดงข้อมูลตั้งต้นจากไฟล์ Excel";
      }

      state.rows = rows.map(row => ({
        ...row,
        hazards: Array.isArray(row.hazards) ? row.hazards : [],
        ppe: Array.isArray(row.ppe) ? row.ppe : []
      }));
      state.filtered = [...state.rows];
      state.page = 1;

      setupFilters();
      render();

      $("sourceSummary").textContent =
        `ข้อมูล ${state.rows.length.toLocaleString("th-TH")} รายการ • ` +
        `${new Set(state.rows.map(row => row.department)).size.toLocaleString("th-TH")} หน่วยงาน • ` +
        `คลังภาพ SDS ${CATALOG.length.toLocaleString("th-TH")} ภาพ`;

      if (showMessage) showToast("โหลดข้อมูลล่าสุดแล้ว");
    } catch (error) {
      console.error(error);
      state.rows = FALLBACK;
      state.filtered = [...FALLBACK];
      setupFilters();
      render();

      banner.className = "status-banner danger";
      banner.hidden = false;
      banner.textContent =
        `เชื่อมต่อฐานข้อมูลไม่สำเร็จ กำลังแสดงข้อมูลสำรอง: ${error.message}`;
      $("dataSourceNote").innerHTML =
        "<b>แหล่งข้อมูล</b><span>ข้อมูลสำรองจากไฟล์ Excel</span>";
    }
  }

  function render() {
    updateKpis(state.filtered);
    renderCharts(state.filtered);
    renderDepartmentButtons();
    renderGallery();
    renderSdsLibrarySearch();
    renderTable(state.filtered);
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("searchInput").addEventListener("input", () => applyFilters());
    ["departmentFilter", "hazardFilter", "ppeFilter", "completenessFilter"]
      .forEach(id => $(id).addEventListener("change", () => applyFilters()));

    $("clearFilters").addEventListener("click", clearFilters);
    $("exportFiltered").addEventListener("click", exportCsv);
    $("refreshBtn").addEventListener("click", () => load(true));

    $("closeGallery").addEventListener("click", () => {
      state.galleryHidden = true;
      $("chemicalGalleryPanel").hidden = true;
    });

    $("closeDetailModal").addEventListener("click", closeModal);
    $("detailModal").addEventListener("click", event => {
      if (event.target === $("detailModal")) closeModal();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeModal();
    });

    load(false);
  });
})();
