const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SchoolConfig = sequelize.define('SchoolConfig', {
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  createdAt: false,
  updatedAt: 'updatedAt'
});

// Get a config value, auto-parsing JSON when possible
SchoolConfig.getConfig = async function(key) {
  const record = await SchoolConfig.findOne({ where: { key } });
  if (!record || record.value === null) return null;
  try {
    return JSON.parse(record.value);
  } catch {
    return record.value;
  }
};

// Set a config value, auto-serializing non-strings to JSON
SchoolConfig.setConfig = async function(key, value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  await SchoolConfig.upsert({ key, value: serialized });
};

module.exports = SchoolConfig;
