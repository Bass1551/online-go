/**
 * Email Service for Go Online
 * Sends Password Reset OTP codes and notifications via Nodemailer / Gmail SMTP
 */

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  // Nodemailer will be available once npm install completes
}

const DEFAULT_GMAIL_USER = 'onlinegoonrender@gmail.com';
const DEFAULT_GMAIL_PASS = 'bfknuizjkfrcndpq';

class EmailService {
  /**
   * Create nodemailer transporter for Gmail
   * Supports port 465 (SSL) and port 587 (TLS/STARTTLS)
   */
  static createTransporter(port = 465, secure = true) {
    const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER || DEFAULT_GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASS || process.env.EMAIL_PASS || DEFAULT_GMAIL_PASS;

    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: port,
      secure: secure,
      auth: {
        user: gmailUser,
        pass: gmailPass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  /**
   * Send Password Reset OTP Email
   * @param {string} toEmail - Recipient email
   * @param {string} username - User account name
   * @param {string} otpCode - 6-digit verification code
   * @returns {Promise<{success: boolean, message: string}>}
   */
  static async sendPasswordResetOtp(toEmail, username, otpCode) {
    if (!toEmail || !toEmail.includes('@')) {
      return { success: false, message: 'บัญชีนี้ไม่ได้ผูกอีเมลที่ถูกต้อง ไม่สามารถส่ง OTP ได้' };
    }

    const senderEmail = process.env.GMAIL_USER || process.env.EMAIL_USER || DEFAULT_GMAIL_USER;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f141c; color: #e6edf3; margin: 0; padding: 20px; }
        .card { max-width: 500px; margin: 0 auto; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 32px; text-align: center; }
        .logo { font-size: 32px; margin-bottom: 8px; }
        .title { color: #f0c674; font-size: 22px; font-weight: bold; margin-bottom: 12px; }
        .desc { font-size: 14px; color: #8b949e; line-height: 1.6; margin-bottom: 24px; }
        .otp-box { background: #0d1117; border: 2px dashed #f0c674; border-radius: 10px; padding: 16px 24px; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #58a6ff; margin-bottom: 24px; display: inline-block; }
        .footer { font-size: 12px; color: #6e7681; border-top: 1px solid #21262d; padding-top: 16px; margin-top: 24px; }
        .highlight { color: #f0c674; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">⚫⚪</div>
        <div class="title">รหัสยืนยันกู้คืนรหัสผ่าน (Go Online)</div>
        <p class="desc">
          สวัสดีคุณ <span class="highlight">${username}</span>,<br>
          ระบบได้รับคำขอรีเซ็ตรหัสผ่านสำหรับบัญชีของคุณ กรุณานำรหัส OTP 6 หลักด้านล่างนี้ไปกรอกที่หน้าเว็บเพื่อตั้งรหัสผ่านใหม่:
        </p>
        <div class="otp-box">${otpCode}</div>
        <p class="desc" style="font-size: 13px; color: #e3b341;">
          ⏱️ รหัสนี้มีอายุการใช้งาน 15 นาที และใช้ได้เพียงครั้งเดียวเท่านั้น
        </p>
        <div class="footer">
          หากคุณไม่ได้เป็นผู้ขอรีเซ็ตรหัสผ่าน สามารถละเว้นอีเมลฉบับนี้ได้อย่างปลอดภัย<br>
          © Go Online - เว็บเกมหมากล้อมออนไลน์
        </div>
      </div>
    </body>
    </html>
    `;

    const mailOptions = {
      from: `"Go Online Game" <${senderEmail}>`,
      to: toEmail,
      subject: `🔑 รหัส OTP กู้คืนรหัสผ่าน: ${otpCode} (Go Online)`,
      text: `สวัสดีคุณ ${username},\n\nรหัส OTP สำหรับรีเซ็ตรหัสผ่านของคุณคือ: ${otpCode}\n(รหัสมีอายุ 15 นาที)\n\nหากคุณไม่ได้ขอ สามารถเพิกเฉยอีเมลนี้ได้ครับ\n\n- Go Online`,
      html: htmlContent
    };

    // Attempt 1: Port 465 (SSL)
    try {
      const transporter465 = EmailService.createTransporter(465, true);
      await transporter465.sendMail(mailOptions);
      console.log(`✅ [EMAIL SENT] Successfully sent OTP to ${toEmail} via Port 465`);
      return {
        success: true,
        message: `ส่งรหัส OTP ไปยังอีเมล ${toEmail} เรียบร้อยแล้ว กรุณาเปิดเช็คในกล่องข้อความหรืออีเมลขยะ (Spam)`
      };
    } catch (err465) {
      console.warn('⚠️ SMTP Port 465 failed, trying Port 587 fallback:', err465.message);
    }

    // Attempt 2: Port 587 (TLS / STARTTLS)
    try {
      const transporter587 = EmailService.createTransporter(587, false);
      await transporter587.sendMail(mailOptions);
      console.log(`✅ [EMAIL SENT] Successfully sent OTP to ${toEmail} via Port 587`);
      return {
        success: true,
        message: `ส่งรหัส OTP ไปยังอีเมล ${toEmail} เรียบร้อยแล้ว กรุณาเปิดเช็คในกล่องข้อความหรืออีเมลขยะ (Spam)`
      };
    } catch (err587) {
      console.error('❌ All SMTP ports failed to send email:', err587.message);
      return {
        success: false,
        message: 'ไม่สามารถส่งอีเมลได้ในขณะนี้ กรุณาตรวจสอบว่ากรอก Gmail ถูกต้อง หรือใช้แท็บ PIN 4 หลักเพื่อตั้งรหัสใหม่'
      };
    }
  }
}

module.exports = EmailService;
