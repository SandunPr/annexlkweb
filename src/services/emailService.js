const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: process.env.EMAIL_SECURE === 'true' || Number(process.env.EMAIL_PORT) === 465,
    auth: process.env.EMAIL_USER ? {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    } : undefined,
  });
}

async function sendVerificationEmail({ email, fullName, token }) {
  const webUrl = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
  const verificationUrl = `${webUrl}/pages/verify-email.html?token=${encodeURIComponent(token)}`;

  if (process.env.NODE_ENV === 'test') return { verificationUrl };

  if (process.env.NODE_ENV !== 'production' && !process.env.EMAIL_HOST) {
    logger.info(`Development email verification link for ${email}: ${verificationUrl}`);
    return { verificationUrl };
  }

  const transport = createTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@annexlk.com',
    to: email,
    subject: 'Verify your AnnexLK email address',
    text: `Hello ${fullName || 'there'}, verify your AnnexLK email address by opening this link: ${verificationUrl}. This link expires in 24 hours.`,
    html: `<p>Hello ${escapeHtml(fullName || 'there')},</p><p>Verify your AnnexLK email address to publish property listings.</p><p><a href="${verificationUrl}">Verify email address</a></p><p>This single-use link expires in 24 hours.</p>`,
  });
  return { verificationUrl };
}

module.exports = { sendVerificationEmail };
