const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Teacher = require('./Teacher');
const Student = require('./Student');

// In-app messages addressed to a teacher. Currently only written by the
// priority-day override in routes/tutoring.js, which is the one place the app
// cancels a booking out from under the teacher who made it - without this they
// would just watch the request vanish from their dashboard, since every list
// view filters cancelled rows out.
const Notification = sequelize.define('Notification', {
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'override'
  },
  // Rendered when the notification is created rather than assembled on read:
  // the teacher should see what was true at the time they were overridden,
  // not a re-derivation from rows that may have changed since.
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  // The date of the session this is about, kept separate from the message so
  // the client can sort and group without parsing prose.
  relatedDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  read: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

// TeacherId is the *recipient*. The teacher who caused the notification is
// named inside `message` rather than carried as a second association - the
// same way conflictReason already records the overriding teacher on the
// cancelled TutoringRequest.
Notification.belongsTo(Teacher);
Notification.belongsTo(Student);

module.exports = Notification;
