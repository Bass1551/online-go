# 🌐 วิธีนำเกมขึ้น Cloud ฟรี ให้เล่นได้ตลอด 24 ชั่วโมง (แม้ปิดคอม)

ผมได้จัดเตรียมโครงสร้างไฟล์ทั้งหมด (`render.yaml`, `package.json`, `.gitignore` และ `git commit`) ไว้ให้พร้อมขึ้น Cloud ทันทีแล้วครับ!

---

## 3 ขั้นตอนง่ายๆ ในการรับลิงก์ 24 ชั่วโมงฟรี (Render.com)

### ขั้นตอนที่ 1: สร้าง Repository บน GitHub (ใช้เวลา 1 นาที)
1. เข้าเว็บ [github.com](https://github.com) (หากยังไม่มีบัญชี สมัครฟรีได้เลยครับ)
2. ไปที่ [github.com/new](https://github.com/new) เพื่อสร้าง Repository ใหม่
3. ตั้งชื่อว่า `online-go` แล้วกดปุ่มสีเขียว **"Create repository"**
4. นำ URL ของ repository มาเชื่อมต่อกับโฟลเดอร์นี้ โดยเปิด PowerShell ในโฟลเดอร์นี้แล้วรัน:
   ```powershell
   git branch -M main
   git remote add origin https://github.com/<ชื่อบัญชีของคุณ>/online-go.git
   git push -u origin main
   ```

---

### ขั้นตอนที่ 2: กด Deploy บน Render.com ฟรี (ใช้เวลา 2 นาที)
1. เข้าเว็บ [render.com](https://render.com) แล้วกด **Sign In with GitHub** (ล็อกอินด้วยบัญชี GitHub ของคุณ)
2. กดปุ่ม **"New +"** (มุมขวาบน) -> เลือก **"Web Service"**
3. เลือก repository `online-go` ที่เพิ่งสร้าง
4. ระบบจะตรวจพบไฟล์ `render.yaml` ที่ผมตั้งค่าไว้ให้โดยอัตโนมัติ:
   - **Environment**: Node
   - **Plan**: Free ($0/เดือน)
5. เลื่อนลงมากดปุ่ม **"Deploy Web Service"**

---

### ขั้นตอนที่ 3: รับลิงก์ถาวร 24 ชม.! 🎉
รอระบบประกอบเซิร์ฟเวอร์ประมาณ 1-2 นาที คุณจะได้ลิงก์ถาวร เช่น:
👉 `https://online-go-xxxx.onrender.com`

- ลิงก์นี้มี **HTTPS ปลอดภัย**
- **เปิดเล่นได้ตลอด 24 ชั่วโมง** แม้คุณจะปิดคอมพิวเตอร์ หรือนอนหลับ
- คุณ แฟน และเพื่อน สามารถเซฟลิงก์นี้ไว้บนหน้าจอมือถือ แล้วกดเข้ามาเล่นหมากล้อม แชทคุย หรือฝึกกับบ็อตได้ทุกที่ทุกเวลาตลอดไปครับ!
