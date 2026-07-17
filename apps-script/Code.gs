const SHEET_NAME = "Chemicals";
const HEADERS = [
  "id","department","code","chemicalName","tradeName",
  "quantity","storage","use","hazards","ppe","updatedAt"
];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "list");
    if (action === "list") {
      return jsonResponse_({ success: true, rows: listRows_() });
    }
    return jsonResponse_({ success: true, message: "Don Tum Chemical API is running" });
  } catch (error) {
    return jsonResponse_({ success: false, message: error.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    verifyPassword_(body.password);
    const action = String(body.action || "");

    if (action === "verify") {
      return jsonResponse_({ success: true, message: "Verified" });
    }
    if (action === "add") {
      const row = normalizeRow_(body.row || {});
      row.id = row.id || Utilities.getUuid();
      row.updatedAt = new Date().toISOString();
      appendRow_(row);
      return jsonResponse_({ success: true, row: row });
    }
    if (action === "update") {
      const row = normalizeRow_(body.row || {});
      if (!row.id) throw new Error("ไม่พบรหัสรายการ");
      row.updatedAt = new Date().toISOString();
      updateRow_(row);
      return jsonResponse_({ success: true, row: row });
    }
    if (action === "delete") {
      const id = String(body.id || "").trim();
      if (!id) throw new Error("ไม่พบรหัสรายการ");
      deleteRow_(id);
      return jsonResponse_({ success: true });
    }
    if (action === "seedInitial") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) throw new Error("ไม่พบข้อมูลตั้งต้น");
      const sheet = getSheet_();
      if (sheet.getLastRow() > 1) {
        throw new Error("ฐานข้อมูลมีข้อมูลอยู่แล้ว ไม่สามารถนำเข้าข้อมูลตั้งต้นซ้ำได้");
      }
      const normalized = rows.map(function(row) {
        const r = normalizeRow_(row);
        r.id = r.id || Utilities.getUuid();
        r.updatedAt = new Date().toISOString();
        return HEADERS.map(function(header) { return serialize_(header, r[header]); });
      });
      sheet.getRange(2, 1, normalized.length, HEADERS.length).setValues(normalized);
      return jsonResponse_({ success: true, imported: normalized.length });
    }

    if (action === "replaceAll") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) throw new Error("ไม่พบข้อมูลชุดใหม่");
      const sheet = getSheet_();
      const backupSheet = backupCurrentData_(sheet);
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
      }
      const normalized = rows.map(function(row) {
        const r = normalizeRow_(row);
        r.id = r.id || Utilities.getUuid();
        r.updatedAt = new Date().toISOString();
        return HEADERS.map(function(header) { return serialize_(header, r[header]); });
      });
      sheet.getRange(2, 1, normalized.length, HEADERS.length).setValues(normalized);
      return jsonResponse_({
        success: true,
        imported: normalized.length,
        backupSheet: backupSheet
      });
    }

    throw new Error("คำสั่งไม่ถูกต้อง");
  } catch (error) {
    return jsonResponse_({ success: false, message: error.message });
  }
}

function setup() {
  getSheet_();
  return "สร้างชีต Chemicals และหัวตารางเรียบร้อย";
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  } else {
    const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (current.join("|") !== HEADERS.join("|")) {
      throw new Error("หัวตารางในชีต Chemicals ไม่ตรงกับระบบ กรุณาตรวจ INSTALL_ADMIN.md");
    }
  }
  return sheet;
}

function listRows_() {
  const sheet = getSheet_();
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getDisplayValues();
  return values
    .filter(function(row) { return row.some(function(cell) { return String(cell).trim() !== ""; }); })
    .map(function(row) {
      const obj = {};
      HEADERS.forEach(function(header, index) {
        obj[header] = deserialize_(header, row[index]);
      });
      return obj;
    });
}

function appendRow_(row) {
  const sheet = getSheet_();
  sheet.appendRow(HEADERS.map(function(header) { return serialize_(header, row[header]); }));
}

function updateRow_(row) {
  const sheet = getSheet_();
  const rowNumber = findRowNumber_(sheet, row.id);
  if (!rowNumber) throw new Error("ไม่พบรายการที่ต้องการแก้ไข");
  sheet.getRange(rowNumber, 1, 1, HEADERS.length)
    .setValues([HEADERS.map(function(header) { return serialize_(header, row[header]); })]);
}

function deleteRow_(id) {
  const sheet = getSheet_();
  const rowNumber = findRowNumber_(sheet, id);
  if (!rowNumber) throw new Error("ไม่พบรายการที่ต้องการลบ");
  sheet.deleteRow(rowNumber);
}


function backupCurrentData_(sheet) {
  if (sheet.getLastRow() < 2) return "";
  const spreadsheet = sheet.getParent();
  const timeZone = Session.getScriptTimeZone() || "Asia/Bangkok";
  const baseName = Utilities.formatDate(new Date(), timeZone, "'Backup_'yyyyMMdd_HHmmss");
  let backupName = baseName;
  let suffix = 2;
  while (spreadsheet.getSheetByName(backupName)) {
    backupName = baseName + "_" + suffix;
    suffix++;
  }
  const backup = sheet.copyTo(spreadsheet);
  backup.setName(backupName);
  return backupName;
}

function findRowNumber_(sheet, id) {
  if (sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id).trim()) return i + 2;
  }
  return 0;
}

function normalizeRow_(input) {
  return {
    id: String(input.id || "").trim(),
    department: String(input.department || "").trim(),
    code: String(input.code || "").trim(),
    chemicalName: String(input.chemicalName || "").trim(),
    tradeName: String(input.tradeName || "").trim(),
    quantity: String(input.quantity || "").trim(),
    storage: String(input.storage || "").trim(),
    use: String(input.use || "").trim(),
    hazards: Array.isArray(input.hazards) ? input.hazards : [],
    ppe: Array.isArray(input.ppe) ? input.ppe : [],
    updatedAt: String(input.updatedAt || "").trim()
  };
}

function serialize_(header, value) {
  if (header === "hazards" || header === "ppe") return JSON.stringify(Array.isArray(value) ? value : []);
  return value == null ? "" : String(value);
}

function deserialize_(header, value) {
  if (header === "hazards" || header === "ppe") {
    try {
      const parsed = JSON.parse(String(value || "[]"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return String(value || "").split("|").map(function(v) { return v.trim(); }).filter(Boolean);
    }
  }
  return String(value || "").trim();
}

function verifyPassword_(password) {
  const saved = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");
  if (!saved) throw new Error("ยังไม่ได้ตั้งค่า ADMIN_PASSWORD ใน Script Properties");
  if (String(password || "") !== saved) throw new Error("รหัสผ่าน Admin ไม่ถูกต้อง");
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
