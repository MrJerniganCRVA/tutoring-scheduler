const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const schoolSettings = require('../utils/schoolSettings');

// @route   GET api/settings
// @desc    The school settings the app needs to render (labels, priority
//          days, no-tutoring days, school year start)
// @access  Private
router.get('/', auth, (req, res) => {
  res.json(schoolSettings.getAll({ publicOnly: true }));
});

module.exports = router;
