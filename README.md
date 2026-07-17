# Dashboard ข้อมูลสารเคมี โรงพยาบาลดอนตูม

เวอร์ชันนี้เป็น Dashboard แบบ Static สำหรับ GitHub Pages

- ไม่มีระบบ Admin
- ไม่ใช้ Google Apps Script
- ไม่เชื่อม Google Sheet
- ใช้ข้อมูลที่ฝังอยู่ใน `data/chemicals.js`
- มีภาพ SDS และปุ่ม **ดูภาพ**

## ไฟล์สำคัญ

- `index.html`
- `assets/app.js`
- `assets/style.css`
- `assets/config.js`
- `data/chemicals.js`
- `data/image_catalog.js`
- `assets/chemical-images/`

## วิธีอัปโหลดขึ้น GitHub

1. แตกไฟล์ ZIP
2. อัปโหลดไฟล์ทั้งหมดแทนของเดิมใน Repository
3. ช่อง Commit message ใส่:

`ตัดระบบ Admin และ Apps Script ออก`

4. กด Commit changes
5. รอ GitHub Pages อัปเดต แล้วกด `Ctrl + F5`

## การแก้ข้อมูลในอนาคต

เนื่องจากไม่มีระบบ Admin หากต้องการแก้ข้อมูล ต้องแก้ไฟล์ `data/chemicals.js` แล้วอัปโหลดขึ้น GitHub ใหม่


## การแก้ไขเวอร์ชัน 7

- ชื่อสารเคมีในตารางและการ์ดเป็นข้อความธรรมดา กดไม่ได้
- เปิดภาพได้เฉพาะปุ่ม **ดูภาพ**
- ปิดการจับคู่ภาพอัตโนมัติ ใช้เฉพาะรายการที่ตรวจสอบแล้ว
- ปุ่ม **ไม่มีภาพ** กดไม่ได้
- หัวตารางสร้างใหม่อัตโนมัติให้ตรงกับข้อมูล 10 คอลัมน์
- ล้างภาพเดิมออกจากหน้าต่างทุกครั้งก่อนเปิดรายการใหม่
