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

class EmailService {
  /**
   * Create nodemailer transporter using environment variables
   * Supported configurations:
   * 1. Gmail: GMAIL_USER and GMAIL_APP_PASS
   * 2. Custom SMTP: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
   */
  static getTransporter() {
    if (!nodemailer) {
      try {
        nodemailer = require('nodemailer');
      } catch (e) {
        return null;
      }
    }

    const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASS || process.env.EMAIL_PASS;

    if (gmailUser && gmailPass) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass
        },
        connectionTimeout: 4000,
        greetingTimeout: 4000,
        socketTimeout: 4000
      });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass) {
      return nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        secure: parseInt(smtpPort, 10) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
    }

    return null;
  }

  /**
   * Send Password Reset OTP Email
   * @param {string} toEmail - Recipient email
   * @param {string} username - User account name
   * @param {string} otpCode - 6-digit verification code
   * @returns {Promise<{success: boolean, message: string, simulated?: boolean}>}
   */
  static async sendPasswordResetOtp(toEmail, username, otpCode) {
    if (!toEmail || !toEmail.includes('@')) {
      return { success: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' };
    }

    const transporter = EmailService.getTransporter();

    // Fallback mode if SMTP credentials are not yet configured in environment variables
    if (!transporter) {
      console.log('----------------------------------------------------');
      console.log(`📧 [EMAIL OTP SIMULATION] Sending to: ${toEmail} (${username})`);
      console.log(`🔑 OTP Verification Code: [ ${otpCode} ] (Valid for 15 minutes)`);
      console.log('💡 Note: Configure GMAIL_USER & GMAIL_APP_PASS in Render/Env to send live emails');
      console.log('----------------------------------------------------');
      return {
        success: true,
        simulated: true,
        message: `สร้างรหัส OTP เรียบร้อยแล้ว (โหมดทดสอบ: ${otpCode})`,
        otpCode
      };
    }

    const senderEmail = process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.SMTP_USER || 'no-reply@online-go.com';

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

    try {
      await Promise.race([
        transporter.sendMail({
          from: `"Go Online Game" <${senderEmail}>`,
          to: toEmail,
          subject: `🔑 รหัส OTP กู้คืนรหัสผ่าน: ${otpCode} (Go Online)`,
          text: `สวัสดีคุณ ${username},\n\nรหัส OTP สำหรับรีเซ็ตรหัสผ่านของคุณคือ: ${otpCode}\n(รหัสมีอายุ 15 นาที)\n\nหากคุณไม่ได้ขอ สามารถเพิกเฉยอีเมลนี้ได้ครับ`,
          html: htmlContent
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout (Render blocks outbound SMTP ports 465/587)')), 4000))
      ]);

      return {
        success: true,
        simulated: false,
        message: `ส่งรหัส OTP ไปยังอีเมล ${toEmail} เรียบร้อยแล้ว กรุณาเปิดเช็คในกล่องข้อความหรืออีเมลขยะ (Spam)`
      };
    } catch (err) {
      console.warn('⚠️ SMTP Error or blocked by host:', err.message);
      return {
        success: true,
        simulated: true,
        blockedByHost: true,
        message: `สร้างรหัส OTP เรียบร้อยแล้ว: ${otpCode}`,
        otpCode
      };
    }
  }
}

module.exports = EmailService;
