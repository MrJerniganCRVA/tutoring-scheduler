const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Teacher = require('./Teacher');
const Student = require('./Student');

const TutoringRequest = sequelize.define('TutoringRequest', {
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  lunchA: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lunchB: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lunchC: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lunchD: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM('active','cancelled', 'conflict'),
    defaultValue: 'active'
  },
  requestedAt :{
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  priority:{
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  conflictReason:{
    type: DataTypes.STRING,
    allowNull: true
  },
  calendar_event_id:{
    type:DataTypes.STRING,
    allowNull: true
  },
  invite_sent:{
    type: DataTypes.BOOLEAN,
    defaultValue:false
  },
  invite_sent_at:{
    type:DataTypes.DATE,
    allowNull:true
  },
  // Attendance is recorded by exception: every booked student is assumed
  // present until the tutoring teacher marks them absent. Kept separate from
  // `status` so absences don't disturb booking, conflict or invite logic,
  // which all key off status 'active'.
  absent:{
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  absentMarkedAt:{
    type: DataTypes.DATE,
    allowNull: true
  }
});

// Define associations
TutoringRequest.belongsTo(Teacher);
TutoringRequest.belongsTo(Student);

module.exports = TutoringRequest;
