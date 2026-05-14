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
 * @param {string} subtitle - Optional subtitle (default: "Verify your artist profile")
 * @returns {string} HTML body
 */
function getOtpEmailHtml(otp, subtitle = 'Verify your artist profile') {
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
                    <p style="margin: 0; font-size: 15px; color: rgba(255,255,255,0.75); line-height: 1.5;">${subtitle}</p>
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
 * Branded HTML template for Welcome email.
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @param {string} username - User's username
 * @returns {string} HTML body
 */
function getWelcomeEmailHtml(name, email, username) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Nano Profiles</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; min-height:100vh;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 460px;">
          <tr>
            <td style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="text-align: center; padding-bottom: 8px;">
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; color: #0066cc; letter-spacing: 0.05em;">WELCOME</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 24px;">
                    <p style="margin: 0; font-size: 16px; color: #1e293b; line-height: 1.5;">Hello ${name || 'there'},</p>
                    <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                      Welcome to <strong>Nano Profiles</strong>! Your profile has been successfully created.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #64748b;">Your Profile Details:</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="90" style="padding: 4px 0; font-size: 14px; color: #94a3b8;">Email:</td>
                        <td style="padding: 4px 0; font-size: 14px; color: #0066cc; font-weight: 600;">${email}</td>
                      </tr>
                      <tr>
                        <td width="90" style="padding: 4px 0; font-size: 14px; color: #94a3b8;">Username:</td>
                        <td style="padding: 4px 0; font-size: 14px; color: #1e293b; font-weight: 600;">${username}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding: 24px 0;">
                    <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569;">
                      To complete your profile and start customizing it, please log in at:
                    </p>
                    <a href="https://nanoprofiles.com" style="display: block; background: #0066cc; color: #ffffff; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
                      Go to nanoprofiles.com
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 20px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                      If you have any questions, please contact our support team.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">Nano Profiles · Personalized Digital Identity</p>
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
 * Branded HTML template for Public Onboarding welcome email.
 * @param {string} type - 'artist', 'general', or 'restaurant'
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @param {string} username - User's username
 * @returns {string} HTML body
 */
function getPublicWelcomeEmailHtml(type, name, email, username) {
    let mainContent = '';
    let greeting = `Hello ${name || 'there'},`;
    
    // Select a random variation index (0, 1, or 2)
    const variation = Math.floor(Math.random() * 3);

    if (type === 'artist') {
        greeting = `Hey artist,`;
        const artistMessages = [
            `
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6; font-style: italic;">
                "Every artist dips his brush in his own soul, and paints his own nature into his pictures."
            </p>
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Thank you for choosing <strong>Nano Profiles</strong>. Your canvas of digital identity has been successfully created. May your online presence be as inspiring and unique as the art you create.
            </p>
            `,
            `
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6; font-style: italic;">
                "Creativity takes courage." — Henri Matisse
            </p>
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Thank you for choosing <strong>Nano Profiles</strong> to showcase your vision to the world. We are honored to provide the platform for your unique creative voice.
            </p>
            `,
            `
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6; font-style: italic;">
                "The world is but a canvas to our imagination." — Henry David Thoreau
            </p>
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Your digital canvas is now ready for your masterpiece. We can't wait to see how you personalize your space and share your passion with the community.
            </p>
            `
        ];
        mainContent = artistMessages[variation];
    } else if (type === 'restaurant') {
        const restaurantMessages = [
            `
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Thank you for choosing <strong>Nano Profiles</strong> for your business!
            </p>
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                We're excited to help you showcase your culinary excellence and connect with your customers in a modern way. Stay tuned for even more professional features to help your business grow and shine.
            </p>
            `,
            `
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Welcome to the <strong>Nano Profiles</strong> family!
            </p>
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                We are dedicated to helping you showcase your culinary passion to the world. Your professional profile is now live and ready to welcome your guests digitally.
            </p>
            `,
            `
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                "Success is best when shared."
            </p>
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                We are honored to share in your business journey. Thank you for choosing our platform to represent your brand. We look forward to seeing your business thrive!
            </p>
            `
        ];
        mainContent = restaurantMessages[variation];
    } else {
        // general
        const generalMessages = [
            `
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Thanks for choosing <strong>Nano Profiles</strong>! We hope everything is going well with you.
            </p>
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Have a great day ahead and have fun with your new digital identity. We're glad to have you on board!
            </p>
            `,
            `
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Welcome aboard! We're excited to see what you'll create with your new profile.
            </p>
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                Your journey with <strong>Nano Profiles</strong> starts today. Explore the customization options and make your profile truly yours. Have fun!
            </p>
            `,
            `
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                It's great to have you here!
            </p>
            <p style="margin: 16px 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
                May your new digital identity bring you many new connections and joy. Thank you for being part of our growing community. Wishing you a wonderful day ahead!
            </p>
            `
        ];
        mainContent = generalMessages[variation];
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Nano Profiles</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; min-height:100vh;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 460px;">
          <tr>
            <td style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="text-align: center; padding-bottom: 8px;">
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; color: #0066cc; letter-spacing: 0.05em;">WELCOME</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 24px;">
                    <p style="margin: 0; font-size: 16px; color: #1e293b; line-height: 1.5;">${greeting}</p>
                    ${mainContent}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 24px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #64748b;">Your Profile Details:</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="90" style="padding: 4px 0; font-size: 14px; color: #94a3b8;">Email:</td>
                        <td style="padding: 4px 0; font-size: 14px; color: #0066cc; font-weight: 600;">${email}</td>
                      </tr>
                      <tr>
                        <td width="90" style="padding: 4px 0; font-size: 14px; color: #94a3b8;">Username:</td>
                        <td style="padding: 4px 0; font-size: 14px; color: #1e293b; font-weight: 600;">${username}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding: 24px 0;">
                    <p style="margin: 0 0 20px 0; font-size: 14px; color: #475569;">
                      Access your dashboard anytime at:
                    </p>
                    <a href="https://nanoprofiles.com" style="display: block; background: #0066cc; color: #ffffff; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
                      nanoprofiles.com
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 20px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                      Stay tuned for more exciting features!
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">Nano Profiles · Personalized Digital Identity</p>
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
 * @param {object} opts - Optional: { subject, textPrefix }
 * @returns {Promise<void>}
 */
async function sendOtpEmail(to, otp, opts = {}) {
    const trans = getTransporter();
    if (!trans) {
        throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    }
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const subtitle = opts.subtitle || 'Verify your artist profile';
    const html = getOtpEmailHtml(otp, subtitle);
    const subject = opts.subject || 'Your verification code – Artist profile';
    const textPrefix = opts.textPrefix || 'Your artist profile verification code';
    await trans.sendMail({
        from: from || 'noreply@nfc.local',
        to,
        subject,
        text: `${textPrefix} is: ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
        html
    });
}

async function sendWelcomeEmail(to, name, username) {
    const trans = getTransporter();
    if (!trans) {
        throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    }
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const html = getWelcomeEmailHtml(name, to, username);
    const subject = 'Welcome to Nano Profiles! Complete your profile';
    
    await trans.sendMail({
        from: from || 'noreply@nfc.local',
        to,
        subject,
        text: `Hello ${name || 'there'},\n\nWelcome to Nano Profiles! Your profile has been created.\n\nYour Details:\nEmail: ${to}\nUsername: ${username}\n\nPlease complete your profile by logging in at https://nanoprofiles.com.\n\nYou can log in using a verification code sent to your email.`,
        html
    });
}

async function sendPublicWelcomeEmail(to, name, username, type = 'general') {
    const trans = getTransporter();
    if (!trans) {
        throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    }
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const html = getPublicWelcomeEmailHtml(type, name, to, username);
    const subject = `Welcome to Nano Profiles! Your ${type} profile is ready`;
    
    await trans.sendMail({
        from: from || 'noreply@nfc.local',
        to,
        subject,
        text: `Welcome to Nano Profiles! Your profile has been created successfully. Username: ${username}. Visit https://nanoprofiles.com to manage your profile.`,
        html
    });
}

module.exports = { sendOtpEmail, sendWelcomeEmail, sendPublicWelcomeEmail, isConfigured, getTransporter };
