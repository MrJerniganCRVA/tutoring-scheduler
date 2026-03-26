const express = require('express');
const router = express.Router();
const passport = require('passport');
const Teacher = require('../models/Teacher');

const DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS === 'true';
const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');

//@route GET  /auth/google
//@desc Redirect to google for auth

router.get(
    '/google',
    passport.authenticate('google',{
        scope: ['profile', 'email','https://www.googleapis.com/auth/calendar.events'],
        accessType: 'offline',
        prompt: 'consent'
    })
);

//@route GET /auth/google/callback
//@desc Handle google callback
router.get(
    '/google/callback',
    passport.authenticate('google',{
        failureRedirect: `${clientUrl}/select-teacher?error=auth_failed`
    }),
    (req, res) =>{
        //success - redirect to login page which will detect session, set localStorage, then go to dashboard
        res.redirect(`${clientUrl}/select-teacher`);
    }
);

//@route GET /auth/logout
//@desc logout the user
router.get('/logout', (req, res)=>{
    req.logout((err)=>{
        if(err){
            return res.status(500).json({msg:'Error logging out'});
        }
        res.json({msg:'Logged user out succesfully'});
    });
});

//@route GET /auth/current
//@desc Get currently logged in teacher
router.get('/current', async (req, res) => {
    if (DEV_AUTH_BYPASS) {
        const teacherId = req.header('x-teacher-id');
        if (!teacherId) return res.status(401).json({ msg: 'User not authenticated' });
        try {
            const teacher = await Teacher.findByPk(teacherId);
            if (!teacher) return res.status(401).json({ msg: 'Teacher not found' });
            return res.json({
                id: teacher.id,
                email: teacher.email,
                firstName: teacher.first_name,
                lastName: teacher.last_name,
                subject: teacher.subject,
                isAdmin: teacher.is_admin
            });
        } catch (err) {
            return res.status(500).json({ msg: 'Server error' });
        }
    }

    if (req.isAuthenticated()) {
        res.json({
            id: req.user.id,
            email: req.user.email,
            firstName: req.user.first_name,
            lastName: req.user.last_name,
            subject: req.user.subject,
            isAdmin: req.user.is_admin
        });
    } else {
        res.status(401).json({ msg: 'User not authenticated' });
    }
});

module.exports = router;