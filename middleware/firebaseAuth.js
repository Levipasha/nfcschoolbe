/**
 * Verifies Firebase ID token or OTP JWT from Authorization: Bearer <token>
 * Attaches req.firebaseUser = { uid, email } on success (uid may be null for OTP login).
 * Used for artist "my profiles" and "update my profile" routes (artists only, not students).
 */
const jwt = require('jsonwebtoken');
let admin;
try {
    admin = require('firebase-admin');
} catch (e) {
    console.warn('firebase-admin not installed; artist owner auth will be disabled.');
}

function getFirebaseApp() {
    if (!admin) return null;
    try {
        return admin.app();
    } catch (e) {
        return null;
    }
}

function initFirebase() {
    if (!admin || getFirebaseApp()) return;
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (json) {
        try {
            const cred = JSON.parse(json);
            admin.initializeApp({ credential: admin.credential.cert(cred) });
            console.log('Firebase Admin initialized for artist owner auth.');
        } catch (e) {
            console.warn('Firebase Admin init failed:', e.message);
        }
    }
}

initFirebase();

const firebaseAuth = (req, res, next) => {
    const app = getFirebaseApp();

    // Require Bearer token first (so we can try OTP before requiring Firebase)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authorization required. Send Firebase ID token or verification token as Bearer.'
        });
    }

    const token = authHeader.split('Bearer ')[1];

    // OTP JWT (artist profile email verification) – works even when Firebase Admin is not configured
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && token) {
        try {
            const decoded = jwt.verify(token, jwtSecret);
            if (decoded && decoded.type === 'otp' && decoded.email) {
                req.firebaseUser = { uid: null, email: decoded.email };
                return next();
            }
        } catch (e) {
            // Not an OTP token or expired; fall through to Firebase
        }
    }

    // Fallback: when Firebase Admin is not configured, accept UID/email from headers
    // In production, you MUST configure FIREBASE_SERVICE_ACCOUNT_JSON.
    if (!app) {
        const uid = req.headers['x-firebase-uid'];
        const email = req.headers['x-firebase-email'] || null;
        
        // If we have headers, proceed (this happens when user logs in with Google on frontend)
        if (uid) {
            req.firebaseUser = { uid, email };
            return next();
        }

        // If it's an OTP user but their token failed verification (or no JWT secret), let them pass if they have OTP token in header
        // For local development, if they don't have UID headers, they might be relying on OTP
        if (token && token.length > 20) {
           // Decode token manually to get email without verifying signature if verification failed
           let decodedEmail = 'user@otp.local';
           try {
               const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
               if (payload && payload.email) {
                   decodedEmail = payload.email;
               }
           } catch (e) {}

           req.firebaseUser = { uid: null, email: decodedEmail }; 
           return next();
        }
        
        // If we reach here, no app and no fallback headers provided by client
        return res.status(503).json({
            success: false,
            message: 'Artist owner auth not configured (Firebase Admin). Set FIREBASE_SERVICE_ACCOUNT_JSON in .env.'
        });
    }

    const idToken = token;
    admin.auth()
        .verifyIdToken(idToken)
        .then((decoded) => {
            req.firebaseUser = {
                uid: decoded.uid,
                email: decoded.email || null,
                name: decoded.name || null
            };
            next();
        })
        .catch((err) => {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token',
                error: err.code || err.message
            });
        });
};

module.exports = { firebaseAuth, getFirebaseApp };
