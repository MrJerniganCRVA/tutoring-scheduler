const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Teacher = require('./Teacher');
const Student = require('./Student');
const TutoringSlot = require('./TutoringSlot');

const TutoringRequest = sequelize.define('TutoringRequest', {
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'cancelled', 'conflict'),
    defaultValue: 'active'
  },
  requestedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  conflictReason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  calendar_event_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  invite_sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  invite_sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

TutoringRequest.belongsTo(Teacher);
TutoringRequest.belongsTo(Student);

// A tutoring request covers one or more TutoringSlots
TutoringRequest.belongsToMany(TutoringSlot, { through: 'TutoringRequestSlots' });
TutoringSlot.belongsToMany(TutoringRequest, { through: 'TutoringRequestSlots' });

module.exports = TutoringRequest;
