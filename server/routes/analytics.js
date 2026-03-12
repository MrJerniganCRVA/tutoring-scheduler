const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');

const Student = require('../models/Student');
const TutoringRequest = require('../models/TutoringRequest');
const {Op} = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

router.get('/:teacherId/student/:studentId', async (req, res) => {
    const teacherId = req.params.teacherId;
    const studentId = req.params.studentId;
    try{
        const teacherRequestsForStudent = await TutoringRequest.findAll({
            where:{
                TeacherId: teacherId,
                StudentId: studentId
            }, 
            raw:true
        });
        let count = 0;
        let dates = [];
        teacherRequestsForStudent.forEach(row=>{
            dates.push(row['date']);
            count++;
        });

        res.json({
            studentId: studentId,
            count: count,
            dates: dates
        });
    } catch (error){
        console.error('Analytics Error:',error);
        res.status(500).json({error: error.message});
    }
});

//Personal Stats work
//Need to work on getting Group Stats

//GET /api/analytics/:teacherID
router.get('/:teacherId', async (req, res)=>{
    const {teacherId} = req.params;
    try{
        const totalSessions = await TutoringRequest.count({
            where: {
                TeacherId: teacherId,
                status:'active'
            }
        });
        //All requests
        const allRequests = await TutoringRequest.findAll({
            where: {
                status: 'active'
            },
            include:[{
                model:Teacher
            },{
                model:Student
            }],
            raw:true
        });
        //Personal Info - Total Tutoring Count
        
        
        //Last 4 Weeks - Personal
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate()-28);

        const weeklyData = await TutoringRequest.findAll({
            where:{
                TeacherId: teacherId,
                status: 'active',
                date: {
                    [Op.gte]: fourWeeksAgo
                },
            },
            attributes: ['date'],
            raw:true
        });
        const weekCounts ={};
        weeklyData.forEach(row=>{
            const date = new Date(row.date);
            const dayOfWeek = date.getDay();
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate()-dayOfWeek);
            const weekKey = weekStart.toISOString().split('T')[0];
            if(!weekCounts[weekKey]){
                weekCounts[weekKey] = 0;
            }
            weekCounts[weekKey]++;
        });
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const lastFourWeeks = Object.keys(weekCounts)
            .sort()
            .map(weekKey => {
                const date = new Date(weekKey);
                const formattedDate = `${monthNames[date.getMonth()]} ${date.getDate()}`;
                return {
                    week: `Week of ${formattedDate}`,
                    sessions: weekCounts[weekKey]
                };
            });
        
        const lastFourWeeksTotal = weeklyData.length;
        const allTeachersCount = await TutoringRequest.findAll({
            where: {status: 'active'},
            attributes: [
                'TeacherId',
                [sequelize.fn('COUNT', sequelize.col('id')),'sessionCount']
            ],
            group: ['TeacherId'],
            raw: true
        });

        const teacherCounts = allTeachersCount.map(t=> parseInt(t.sessionCount));
        teacherCounts.sort((a,b)=>a -b);

        const teacherSessionsCounts = totalSessions;
        const teacherBelowCount = teacherCounts.filter(count=> count<teacherSessionsCounts).length;
        const percentile = teacherCounts.length > 0
            ? Math.round((teacherBelowCount / teacherCounts.length)*100)
            : 0;
            
        const topStudents = await TutoringRequest.findAll({
            where:{
                TeacherId: teacherId,
                status:'active'
            },
            attributes: [
                'StudentId',
                [sequelize.fn('COUNT', sequelize.col('TutoringRequest.id')), 'sessionCount']
            ],
            include:[{
                model: Student,
                attributes: ['first_name','last_name']
            }],
            group:['StudentId', 'Student.id','Student.first_name','Student.last_name'],
            order:[[sequelize.fn('COUNT', sequelize.col('TutoringRequest.id')),'DESC']],
            limit:10,
            raw: true
        });

        const topStudentsFormatted = topStudents.map(row => ({
            studentName: `${row['Student.first_name']} ${row['Student.last_name']}`,
            sessions: parseInt(row.sessionCount)
        }));

        const allTeacherSessions = await TutoringRequest.findAll({
            where: {
                TeacherId: teacherId,
                status: 'active'
            },
            attributes: ['date'],
            raw: true
        });

        const dayOfWeekCounts = {
            'Monday': 0,
            'Tuesday': 0,
            'Wednesday': 0,
            'Thursday': 0,
            'Friday': 0
        };
        const dayIndexToNames = {
            1: 'Monday',
            2: 'Tuesday',
            3: 'Wednesday',
            4: 'Thursday',
            5: 'Friday'
        };
        allTeacherSessions.forEach(row=>{
            const dateStr = typeof row.date === 'string' ? row.date : row.date.toISOString().split('T')[0];
            const [year, month, day] = dateStr.split('-').map(Number);
            const date = new Date(year, month-1, day);
            if(isNaN(date.getTime())){
                console.warn('Invalid date found', row.date);
            }
            const dayIndex = date.getDay();
            const dayName = dayIndexToNames[dayIndex];
            if(dayName && dayOfWeekCounts[dayName]!== undefined){
                dayOfWeekCounts[dayName]++;
            }
        });
        const dayOfWeekData = Object.keys(dayOfWeekCounts).map(day=>({
            day: day,
            sessions: dayOfWeekCounts[day]
        }));
        const personalStats = {
            totalSessions,
            lastFourWeeksTotal,
            percentile,
            lastFourWeeks,
            topStudents: topStudentsFormatted,
            dayOfWeekData
        };
        //School stats — derive subject breakdown dynamically from DB
        const subjectBreakdown = {};
        allRequests.forEach(row => {
            const subject = row['Teacher.subject'];
            if (subject) {
                subjectBreakdown[subject] = (subjectBreakdown[subject] || 0) + 1;
            }
        });
        const schoolStats ={
            subjectBreakdown
        }
        res.json({
            personalStats,
            schoolStats
        });
    } catch (error){
        console.error('Analytics Error:', error);
        res.status(500).json({error: error.message});
    }
});

module.exports = router;