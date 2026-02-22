/**
 * Send email via SMTP (e.g. for OTP).
 * Requires: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    try {
        const nodemailer = require('nodemailer');
        transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass }
        });
        return transporter;
    } catch (e) {
        console.warn('Nodemailer not installed or SMTP config missing:', e.message);
        return null;
    }
}

function isConfigured() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Branded HTML template for OTP email (matches landing page theme: dark, blue accent).
 * @param {string} otp - 6-digit OTP
 * @returns {string} HTML body
 */
function getOtpEmailHtml(otp) {
    const safeOtp = String(otp).replace(/[^0-9]/g, '');
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification code</title>
</head>
<body style="margin:0; padding:0; background-color:#0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0a0a0a; min-height:100vh;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 420px;">
          <tr>
            <td style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 40px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="text-align: center; padding-bottom: 8px;">
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; color: #ffffff; letter-spacing: 0.05em;">PROFILE</span>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding-bottom: 24px;">
                    <p style="margin: 0; font-size: 15px; color: rgba(255,255,255,0.75); line-height: 1.5;">Verify your artist profile</p>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: rgba(255,255,255,0.8);">Your verification code</p>
                    <div style="display: inline-block; background: rgba(255,255,255,0.08); border: 2px solid #0066cc; border-radius: 12px; padding: 20px 32px;">
                      <span style="font-family: 'Courier New', Courier, monospace; font-size: 28px; font-weight: bold; color: #0066cc; letter-spacing: 0.35em;">${safeOtp}</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding-top: 8px;">
                    <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.5);">This code expires in <strong style="color: rgba(255,255,255,0.7);">10 minutes</strong>.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 28px; border-top: 1px solid rgba(255,255,255,0.08); margin-top: 24px;">
                    <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.4); text-align: center;">If you didn’t request this code, you can ignore this email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.35);">Nano Profiles · Artist verification</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Send OTP email (branded HTML matching landing page theme).
 * @param {string} to - Recipient email
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<void>}
 */
async function sendOtpEmail(to, otp) {
    const trans = getTransporter();
    if (!trans) {
        throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    }
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const html = getOtpEmailHtml(otp);
    await trans.sendMail({
        from: from || 'noreply@nfc.local',
        to,
        subject: 'Your verification code – Artist profile',
        text: `Your artist profile verification code is: ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
        html
    });
}

module.exports = { sendOtpEmail, isConfigured, getTransporter };
