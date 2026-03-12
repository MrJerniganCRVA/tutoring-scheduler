const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// A Period represents a class period slot (e.g. "1st Period", "Period 2").
// Admin-configurable: schools create as many periods as they need.
const Period = sequelize.define('Period', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
});

module.exports = Period;
