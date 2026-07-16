window.CHEMICAL_DASHBOARD_CONFIG = {
  HOSPITAL_NAME: "โรงพยาบาลดอนตูม",
  DASHBOARD_TITLE: "ระบบข้อมูลสารเคมีภายในโรงพยาบาล",

  // Google Sheet จากลิงก์ที่ให้มา
  SHEET_ID: "1m4vF9B-lr9KjESASJhYR-hEi250YbmUeG2rdUtox4lo",

  // ใช้แท็บแรกเป็นค่าเริ่มต้น หากข้อมูลอยู่แท็บอื่นให้ดูค่า gid=... จาก URL แล้วแก้ตรงนี้
  SHEET_GID: "0",

  // จำนวนวันที่ใช้เตือนก่อนหมดอายุ
  EXPIRY_WARNING_DAYS: 90,

  // รีเฟรชอัตโนมัติทุกกี่นาที กำหนด 0 เพื่อปิด
  AUTO_REFRESH_MINUTES: 10,

  // จำนวนแถวต่อหน้า
  PAGE_SIZE: 25,

  // ไม่แสดงชื่อผู้รับผิดชอบบนหน้าเว็บสาธารณะ
  SHOW_RESPONSIBLE_PERSON: false
};
