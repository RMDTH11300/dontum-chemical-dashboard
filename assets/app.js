(() => {
  "use strict";

  const CONFIG = window.CHEMICAL_APP_CONFIG || {};
  const DATA = Array.isArray(window.CHEMICAL_DATA) ? window.CHEMICAL_DATA : [];
  const SOURCE = window.CHEMICAL_SOURCE_SUMMARY || {};
  const IMAGE_MAP = window.CHEMICAL_IMAGE_MAP || {};

  const state = {
    rows: [], filtered: [], page: 1, charts: {}, galleryHidden: false
  };

  const $ = id => document.getElementById(id);
  const text = value => String(value ?? "").trim();
  const normalize = value => text(value).toLowerCase().replace(/\s+/g, " ");

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "th"));
  }

  function fillSelect(id, values, label) {
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
    fillSelect(
      "departmentFilter",
      uniqueSorted(state.rows.flatMap(row => row.departments || [row.department])),
      "ทุกหน่วยงาน"
    );
    fillSelect(
      "hazardFilter",
      uniqueSorted(state.rows.map(row => row.hazardGroup)),
      "ทุกกลุ่มอันตราย"
    );
    fillSelect(
      "ppeFilter",
      uniqueSorted(state.rows.flatMap(row => row.ppe || [])),
      "PPE ทุกประเภท"
    );
    fillSelect(
      "reviewFilter",
      uniqueSorted(state.rows.map(row => row.reviewStatus)),
      "ทุกสถานะ"
    );
  }

  function applyFilters(options = {}) {
    const query = normalize($("searchInput").value);
    const department = $("departmentFilter").value;
    const hazard = $("hazardFilter").value;
    const ppe = $("ppeFilter").value;
    const review = $("reviewFilter").value;

    state.filtered = state.rows.filter(row => {
      const blob = normalize([
        row.id, row.sdsCode, row.chemicalName, ...(row.departments || [row.department]),
        row.hazardGroup, row.ppeText, row.spillControl, row.firstAid,
        row.prohibitions, row.reviewStatus
      ].join(" "));

      return (!query || blob.includes(query))
        && (!department || (row.departments || [row.department]).includes(department))
        && (!hazard || row.hazardGroup === hazard)
        && (!ppe || (row.ppe || []).includes(ppe))
        && (!review || row.reviewStatus === review);
    });

    state.page = 1;
    state.galleryHidden = false;
    render();

    if (options.scrollGallery && !$("chemicalGalleryPanel").hidden) {
      $("chemicalGalleryPanel")
        .scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function clearFilters() {
    [
      "searchInput", "departmentFilter", "hazardFilter",
      "ppeFilter", "reviewFilter"
    ].forEach(id => $(id).value = "");

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

  function imageForRow(row) {
    const imageId = IMAGE_MAP[row.id];
    const expectedCode = imageId ? `SDS-CHEM-${imageId}` : "";

    // แสดงภาพเฉพาะเมื่อ Chemical ID, SDS Code และเลขภาพตรงกัน
    if (!imageId || row.sdsCode !== expectedCode) return null;

    return {
      id: imageId,
      sdsCode: expectedCode,
      path: `assets/chemical-images/chemical-${imageId}.webp`
    };
  }

  function updateKpis(rows) {
    $("kpiRecords").textContent = rows.length.toLocaleString("th-TH");
    $("kpiDepartments").textContent =
      new Set(rows.flatMap(row => row.departments || [row.department]).filter(Boolean))
        .size.toLocaleString("th-TH");
    $("kpiHazards").textContent =
      new Set(rows.map(row => row.hazardGroup).filter(Boolean))
        .size.toLocaleString("th-TH");
    $("kpiImages").textContent =
      rows.filter(row => imageForRow(row)).length.toLocaleString("th-TH");
    $("kpiPending").textContent =
      rows.filter(row => /ร่าง|ทบทวน|ยืนยัน/i.test(row.reviewStatus))
        .length.toLocaleString("th-TH");
    $("resultCount").textContent = rows.length.toLocaleString("th-TH");
  }

  function drawChart(id, type, labels, values, label, horizontal = false) {
    if (typeof Chart === "undefined") return;
    if (state.charts[id]) state.charts[id].destroy();

    state.charts[id] = new Chart($(id), {
      type,
      data: {
        labels,
        datasets: [{ label, data: values, borderWidth: 1.5 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        plugins: {
          legend: {
            display: type === "doughnut",
            position: "bottom"
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
    let values = countBy(rows.flatMap(row => row.departments || [row.department]));
    drawChart(
      "departmentChart", "bar",
      values.map(item => item[0]), values.map(item => item[1]),
      "จำนวนรายการ", true
    );

    values = countBy(rows.map(row => row.hazardGroup));
    drawChart(
      "hazardChart", "bar",
      values.map(item => item[0]), values.map(item => item[1]),
      "จำนวนรายการ", true
    );

    values = countBy(rows.flatMap(row => row.ppe || []));
    drawChart(
      "ppeChart", "bar",
      values.map(item => item[0]), values.map(item => item[1]),
      "จำนวนรายการ", true
    );

    values = countBy(rows.map(row => row.reviewStatus));
    drawChart(
      "reviewChart", "doughnut",
      values.map(item => item[0]), values.map(item => item[1]),
      "จำนวนรายการ"
    );
  }

  function renderDepartmentButtons() {
    const wrap = $("departmentButtons");
    wrap.innerHTML = "";
    const selected = $("departmentFilter").value;

    countBy(state.rows.flatMap(row => row.departments || [row.department]))
      .forEach(([department, count]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          `department-button${selected === department ? " active" : ""}`;

        const label = document.createElement("span");
        label.textContent = department;

        const badge = document.createElement("span");
        badge.className = "count";
        badge.textContent = count.toLocaleString("th-TH");

        button.append(label, badge);
        button.addEventListener("click", () => {
          $("departmentFilter").value = department;
          applyFilters({ scrollGallery: true });
        });
        wrap.appendChild(button);
      });
  }

  function createDepartmentButtons(row, compact = false) {
    const wrap = document.createElement("div");
    wrap.className = compact
      ? "department-tag-list compact"
      : "department-tag-list";

    const departments = row.departments || [row.department];

    departments.forEach(department => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = compact
        ? "department-mini-button compact"
        : "department-mini-button";
      button.textContent = department;
      button.addEventListener("click", () => {
        $("departmentFilter").value = department;
        applyFilters({ scrollGallery: true });
      });
      wrap.appendChild(button);
    });

    return wrap;
  }

  function createTags(items, kind) {
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
    const shouldShow =
      !state.galleryHidden && Boolean(query || department);

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
      empty.textContent = "ไม่พบข้อมูลตามเงื่อนไขที่เลือก";
      grid.appendChild(empty);
      return;
    }

    rows.forEach(row => {
      const image = imageForRow(row);
      const card = document.createElement("article");
      card.className = "chemical-card chemical-card-no-thumbnail";

      const body = document.createElement("div");
      body.className = "chemical-card-body";

      const topLine = document.createElement("div");
      topLine.className = "card-top-line";

      const departmentButtons = createDepartmentButtons(row, true);

      const imageStatus = document.createElement("span");
      imageStatus.className =
        `image-availability ${image ? "available" : "unavailable"}`;
      imageStatus.textContent = image ? "มีภาพ SDS" : "ยังไม่มีภาพ";

      topLine.append(departmentButtons, imageStatus);

      const title = document.createElement("h4");
      title.className = "chemical-card-title-static";
      title.textContent = row.chemicalName;

      const idLine = document.createElement("div");
      idLine.className = "card-trade";
      idLine.textContent = `${row.id} • ${row.sdsCode}`;

      const hazard = document.createElement("div");
      hazard.className = "card-highlight danger-highlight";
      hazard.innerHTML = `<strong>กลุ่มอันตราย:</strong> ${row.hazardGroup || "–"}`;

      const data = document.createElement("dl");
      data.className = "card-data";
      [
        ["PPE", row.ppeText],
        ["Spill Kit", row.spillControl],
        ["ปฐมพยาบาล", row.firstAid],
      ].forEach(([label, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value || "–";
        data.append(dt, dd);
      });

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "btn outline small";
      detailButton.textContent = "ดูรายละเอียด";
      detailButton.addEventListener("click", () =>
        openRowDetail(row, image, false)
      );

      const imageButton = document.createElement("button");
      imageButton.type = "button";
      imageButton.className = "btn primary small";
      imageButton.textContent = image ? "ดูภาพ" : "ไม่มีภาพ";
      imageButton.disabled = !image;
      if (image) {
        imageButton.addEventListener("click", () =>
          openRowDetail(row, image, true)
        );
      }

      actions.append(detailButton, imageButton);
      body.append(topLine, title, idLine, hazard, data, actions);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  function detailSection(title, content, className = "") {
    const section = document.createElement("section");
    section.className = `detail-section ${className}`.trim();

    const heading = document.createElement("h4");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.className = "detail-paragraph";
    paragraph.textContent = content || "–";

    section.append(heading, paragraph);
    $("detailInformation").appendChild(section);
  }

  function identificationSection(row) {
    const section = document.createElement("section");
    section.className = "detail-section";

    const heading = document.createElement("h4");
    heading.textContent = "ข้อมูลระบุรายการ";

    const list = document.createElement("dl");
    list.className = "detail-grid";

    [
      ["Chemical ID", row.id],
      ["SDS Code", row.sdsCode],
      ["ชื่อสารเคมี", row.chemicalName],
      ["หน่วยงาน", (row.departments || [row.department]).join(", ")],
      ["กลุ่มอันตราย", row.hazardGroup],
    ].forEach(([label, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value || "–";
      list.append(dt, dd);
    });

    section.append(heading, list);
    $("detailInformation").appendChild(section);
  }

  function openRowDetail(row, image, showImage = false) {
    $("detailModalTitle").textContent = row.chemicalName;
    $("detailInformation").innerHTML = "";

    const body = document.querySelector(".chemical-detail-body");
    const imageWrap = $("detailImageWrap");
    imageWrap.innerHTML = "";
    imageWrap.hidden = !showImage;
    body.classList.toggle("detail-only", !showImage);

    if (showImage && image) {
      const img = document.createElement("img");
      img.src = image.path;
      img.alt = `ภาพ SDS ${row.chemicalName}`;
      imageWrap.appendChild(img);
    }

    identificationSection(row);

    const ppeSection = document.createElement("section");
    ppeSection.className = "detail-section";
    const ppeHeading = document.createElement("h4");
    ppeHeading.textContent = "อุปกรณ์ป้องกันส่วนบุคคล";
    ppeSection.append(ppeHeading, createTags(row.ppe, "ppe"));
    $("detailInformation").appendChild(ppeSection);

    detailSection("Spill Kit / วิธีควบคุม", row.spillControl, "safe-section");
    detailSection("ปฐมพยาบาล", row.firstAid, "first-aid-section");
    detailSection("ข้อห้ามสำคัญ", row.prohibitions, "danger-section");
    detailSection("สถานะทบทวน", row.reviewStatus, "review-section");

    const notice = document.createElement("div");
    notice.className = "detail-note";
    notice.textContent =
      "ข้อมูลนี้ใช้เป็นแนวทางตอบสนองเบื้องต้น ไม่ใช้แทน SDS ของผู้ผลิต " +
      "ก่อนประกาศใช้ต้องยืนยัน PPE วิธีควบคุม ปฐมพยาบาล และข้อห้ามกับ SDS ฉบับปัจจุบัน";
    $("detailInformation").appendChild(notice);

    $("detailModal").classList.add("open");
    $("detailModal").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("detailModal").classList.remove("open");
    $("detailModal").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    $("detailImageWrap").innerHTML = "";
  }

  function makeCell(value, className = "") {
    const td = document.createElement("td");
    td.textContent = value || "–";
    if (className) td.className = className;
    return td;
  }

  function ensureTableHeaders() {
    const headerRow = document.querySelector(".table-panel thead tr");
    if (!headerRow) return;

    const headers = [
      "ลำดับ", "หน่วยงาน", "Chemical ID", "ชื่อสารเคมี", "ภาพ SDS",
      "กลุ่มอันตรายเบื้องต้น", "PPE", "Spill Kit / วิธีควบคุม",
      "ปฐมพยาบาล", "ข้อห้ามสำคัญ", "สถานะทบทวน"
    ];

    headerRow.innerHTML = "";
    headers.forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    });
  }

  function renderTable(rows) {
    ensureTableHeaders();
    const body = $("tableBody");
    body.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 11;
      td.className = "empty";
      td.textContent = "ไม่พบข้อมูลตามเงื่อนไขที่เลือก";
      tr.appendChild(td);
      body.appendChild(tr);
      $("pagination").innerHTML = "";
      return;
    }

    const pageSize = Number(CONFIG.PAGE_SIZE || 20);
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * pageSize;

    rows.slice(start, start + pageSize).forEach((row, index) => {
      const image = imageForRow(row);
      const tr = document.createElement("tr");

      tr.appendChild(makeCell(String(start + index + 1)));

      const departmentCell = document.createElement("td");
      departmentCell.className = "multi-department-cell";
      departmentCell.appendChild(createDepartmentButtons(row, false));
      tr.appendChild(departmentCell);

      tr.appendChild(makeCell(row.id));

      const nameCell = document.createElement("td");
      nameCell.className = "name-cell";
      const name = document.createElement("strong");
      name.className = "chemical-name-text";
      name.textContent = row.chemicalName;
      const sdsCode = document.createElement("span");
      sdsCode.textContent = row.sdsCode;
      nameCell.append(name, sdsCode);
      tr.appendChild(nameCell);

      const imageCell = document.createElement("td");
      const imageButton = document.createElement("button");
      imageButton.type = "button";
      imageButton.className = "btn primary small";
      imageButton.textContent = image ? "ดูภาพ" : "ไม่มีภาพ";
      imageButton.disabled = !image;
      if (image) {
        imageButton.addEventListener("click", () =>
          openRowDetail(row, image, true)
        );
      }
      imageCell.appendChild(imageButton);
      tr.appendChild(imageCell);

      tr.appendChild(makeCell(row.hazardGroup, "hazard-text-cell"));

      const ppeCell = document.createElement("td");
      ppeCell.appendChild(createTags(row.ppe, "ppe"));
      tr.appendChild(ppeCell);

      tr.appendChild(makeCell(row.spillControl, "long-text-cell safe-text"));
      tr.appendChild(makeCell(row.firstAid, "long-text-cell"));
      tr.appendChild(makeCell(row.prohibitions, "long-text-cell danger-text"));
      tr.appendChild(makeCell(row.reviewStatus, "review-status-cell"));

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
      "Chemical ID", "SDS Code", "ชื่อสารเคมี", "หน่วยงาน",
      "กลุ่มอันตรายเบื้องต้น", "PPE", "Spill Kit / วิธีควบคุม",
      "ปฐมพยาบาล", "ข้อห้ามสำคัญ", "สถานะทบทวน"
    ];

    const rows = state.filtered.map(row => [
      row.id, row.sdsCode, row.chemicalName, ...(row.departments || [row.department]),
      row.hazardGroup, row.ppeText, row.spillControl,
      row.firstAid, row.prohibitions, row.reviewStatus
    ]);

    const csv = "\ufeff" +
      [headers, ...rows]
        .map(row => row.map(escapeCsv).join(","))
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "WI-CHEM-001-quick-reference-filtered.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function load(showMessage = true) {
    state.rows = DATA.map(row => ({
      ...row,
      departments: Array.isArray(row.departments) && row.departments.length
        ? row.departments
        : [row.department || "ไม่ระบุหน่วยงาน"],
      hazards: Array.isArray(row.hazards) ? row.hazards : [],
      ppe: Array.isArray(row.ppe) ? row.ppe : []
    }));
    state.filtered = [...state.rows];
    state.page = 1;

    setupFilters();
    render();

    $("sourceSummary").textContent =
      `ข้อมูล ${state.rows.length.toLocaleString("th-TH")} รายการ • ` +
      `${new Set(state.rows.flatMap(row => row.departments || [row.department])).size.toLocaleString("th-TH")} หน่วยงาน • ` +
      `มีภาพที่ตรวจสอบแล้ว ${state.rows.filter(row => imageForRow(row)).length.toLocaleString("th-TH")} รายการ`;

    if (showMessage) showToast("โหลดข้อมูลล่าสุดแล้ว");
  }

  function render() {
    updateKpis(state.filtered);
    renderCharts(state.filtered);
    renderDepartmentButtons();
    renderGallery();
    renderTable(state.filtered);
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("searchInput").addEventListener("input", () => applyFilters());

    [
      "departmentFilter", "hazardFilter", "ppeFilter", "reviewFilter"
    ].forEach(id => {
      $(id).addEventListener("change", () => applyFilters());
    });

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
