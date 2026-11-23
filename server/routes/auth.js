const express = require('express');
const router = express.Router();
const passport = require('passport');
const { oauthLimiter, sessionLimiter } = require('../middleware/rateLimiters');
const Enrollment = require('../models/Enrollment');
const { CASELOAD_PERIOD } = require('./caseload');

const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');

//@route GET  /auth/google
//@desc Redirect to google for auth

router.get(
    '/google',
    oauthLimiter,
    passport.authenticate('google',{
        scope: ['profile', 'email','https://www.googleapis.com/auth/calendar.events'],
        accessType: 'offline',
        prompt: 'consent'
    })
);

//@route GET /auth/google/callback
//@desc Handle google callback
// TEMPORARY (remove once sign-in is confirmed working): records the proxy chain as it
// actually arrived, so the logs show whether req.secure would have been false without the
// X-Forwarded-Proto normalisation in server.js -- the condition that makes express-session
// drop the session cookie silently.
const logCallbackContext = (req, res, next) => {
    console.log('[auth] callback', {
        secure: req.secure,
        protocol: req.protocol,
        rawForwardedProto: req.rawForwardedProto ?? '(not normalised)',
        xForwardedFor: req.get('x-forwarded-for') || null
    });
    next();
};

router.get(
    '/google/callback',
    oauthLimiter,
    logCallbackContext,
    passport.authenticate('google',{
        failureRedirect: `${clientUrl}/select-teacher?error=auth_failed`
    }),
    (req, res) =>{
        //success - redirect to login page which will detect session, set localStorage, then go to dashboard
        res.on('finish', () => {
            console.log('[auth] callback result', {
                sessionId: req.sessionID ? 'present' : 'MISSING',
                setCookieSent: Boolean(res.getHeader('set-cookie'))
            });
        });
        res.redirect(`${clientUrl}/select-teacher`);
    }
);

//@route GET /auth/logout
//@desc logout the user
router.get('/logout', sessionLimiter, (req, res)=>{
    req.logout((err)=>{
        if(err){
            return res.status(500).json({msg:'Error logging out'});
        }
        res.json({msg:'Logged user out succesfully'});
    });
});

//@route GET /auth/current
//@desc Get currently logged in teacher
router.get('/current', sessionLimiter, async (req, res)=>{
    if(req.isAuthenticated()){
        // Unlocks the "My Caseload" tab. Driven by data rather than by
        // subject === 'SPED', so any case manager with students gets it.
        let hasCaseload = false;
        try {
            hasCaseload = (await Enrollment.count({ where: { period: CASELOAD_PERIOD, TeacherId: req.user.id } })) > 0;
        } catch (err) {
            console.error('Caseload check failed:', err.message);
        }
        res.json({
            id:req.user.id,
            email:req.user.email,
            firstName: req.user.first_name,
            lastName: req.user.last_name,
            subject: req.user.subject,
            lunch:req.user.lunch,
            isAdmin:req.user.is_admin,
            hasCaseload
        });
    } else{
        res.status(401).json({msg:'User not authenticated'});
    }
});

module.exports = router;