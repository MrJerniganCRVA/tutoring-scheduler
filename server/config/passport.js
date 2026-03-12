const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Teacher = require('../models/Teacher');
const SchoolConfig = require('../models/SchoolConfig');

module.exports = function(passport) {
    passport.use(
        new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.CALLBACK_URL
        },
        async (accessToken, refreshToken, Profiler, done) => {
            try{
                const {id, emails, name} = Profiler;
                const email = emails[0].value;
                
                // Check domain restriction if configured by admin
                const allowedDomain = await SchoolConfig.getConfig('allowed_email_domain');
                if (allowedDomain && !email.endsWith(allowedDomain)) {
                    return done(null, false, {
                        message: `Only ${allowedDomain} emails can be used to access`
                    });
                }

                //teacher is part of org. see if we can find them
                let teacher = await Teacher.findOne({
                    where: {google_id: id}
                });
                const tokenExpiry = new Date();
                tokenExpiry.setHours(tokenExpiry.getHours()+1);
                //if teacher exists, update info
                if(teacher){
                    await teacher.update({
                        email: email,
                        first_name: name.givenName,
                        last_name: name.familyName,
                        access_token: accessToken,
                        refresh_token: refreshToken || teacher.refresh_token,
                        token_expiry: tokenExpiry
                    });
                    return done(null, teacher);
                }

                //teacher exists but doesn't have google id so find by email then give id
                teacher = await Teacher.findOne({
                    where: {email: email}
                });
                if(teacher){
                    await teacher.update({
                        google_id: id,
                        first_name: name.givenName,
                        last_name: name.familyName,
                        access_token: accessToken,
                        refresh_token: refreshToken,
                        token_expiry: tokenExpiry
                    });
                    return done(null, teacher);
                }

                //email and id don't exist, so non-teacher trying to access, reject access
                return done(null, false, {
                    message:'No teacher account found. Please contact support'
                });

            } catch(err){
                console.error('Oauth passport error: ', err);
                return done(err, null);
            }
        }
    )
    );

    //serialize user
    passport.serializeUser((teacher, done)=>{
        done(null, teacher.id);
    });

    //deserialize
    passport.deserializeUser(async (id, done)=>{
        try{
            const teacher = await Teacher.findByPk(id);
            done(null, teacher);
        }catch (err){
            done(err, null);
        }
    
    });
};