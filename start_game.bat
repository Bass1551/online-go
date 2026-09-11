@echo off
title Online Go Server (หมากล้อมออนไลน์)
echo กำลังเริ่มต้นเซิร์ฟเวอร์เกมหมากล้อมออนไลน์...
cd /d "%~dp0"
node server/server.js
pause
