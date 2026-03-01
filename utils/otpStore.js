/**
 * In-memory OTP store for artist profile email verification.
 * Keys: lowercase email. Value: { otp, expiresAt }.
 * OTPs expire after OTP_EXPIRY_MS (default 10 minutes).
 */
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const store = new Map();

function key(email) {
    return (email || '').toLowerCase().trim();
}

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function setOtp(email, otp) {
    const k = key(email);
    if (!k) return null;
    store.set(k, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS });
    return otp;
}

function getOtp(email) {
    const k = key(email);
    const entry = store.get(k);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        store.delete(k);
        return null;
    }
    return entry.otp;
}

function consumeOtp(email, otp) {
    const k = key(email);
    const entry = store.get(k);
    if (!entry || entry.otp !== String(otp).trim()) return false;
    if (Date.now() > entry.expiresAt) {
        store.delete(k);
        return false;
    }
    store.delete(k);
    return true;
}

// Admin OTP (separate key prefix to avoid conflict with artist OTPs)
const ADMIN_PREFIX = 'admin:';
function adminKey(email) {
    return ADMIN_PREFIX + key(email);
}
function setAdminOtp(email, otp) {
    const k = adminKey(email);
    if (!k || k === ADMIN_PREFIX) return null;
    store.set(k, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS });
    return otp;
}
function consumeAdminOtp(email, otp) {
    const k = adminKey(email);
    const entry = store.get(k);
    if (!entry || entry.otp !== String(otp).trim()) return false;
    if (Date.now() > entry.expiresAt) {
        store.delete(k);
        return false;
    }
    store.delete(k);
    return true;
}

module.exports = {
    generateOtp,
    setOtp,
    getOtp,
    consumeOtp,
    setAdminOtp,
    consumeAdminOtp,
    OTP_EXPIRY_MS
};
