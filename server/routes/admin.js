const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const SchoolConfig = require('../models/SchoolConfig');
const TutoringSlot = require('../models/TutoringSlot');
const Period = require('../models/Period');

// All routes in this file require admin authentication
router.use(adminAuth);

// ---------------------------------------------------------------------------
// SchoolConfig
// ---------------------------------------------------------------------------

// GET /api/admin/config
// Returns all school config key-value pairs as a flat object
router.get('/config', async (req, res) => {
  try {
    const records = await SchoolConfig.findAll();
    const config = {};
    records.forEach(r => {
      try {
        config[r.key] = JSON.parse(r.value);
      } catch {
        config[r.key] = r.value;
      }
    });
    res.json(config);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// PUT /api/admin/config
// Update one or more config values. Body: { key: value, ... }
router.put('/config', async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ msg: 'Request body must be a key-value object' });
    }
    for (const [key, value] of Object.entries(updates)) {
      await SchoolConfig.setConfig(key, value);
    }
    res.json({ msg: 'Config updated successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ---------------------------------------------------------------------------
// TutoringSlots
// ---------------------------------------------------------------------------

// GET /api/admin/tutoring-slots
router.get('/tutoring-slots', async (req, res) => {
  try {
    const slots = await TutoringSlot.findAll({ order: [['order', 'ASC']] });
    res.json(slots);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/admin/tutoring-slots
// Body: { name, order, startTime, endTime }
router.post('/tutoring-slots', async (req, res) => {
  try {
    const { name, order, startTime, endTime } = req.body;
    if (!name || !startTime || !endTime) {
      return res.status(400).json({ msg: 'name, startTime, and endTime are required' });
    }
    const slot = await TutoringSlot.create({ name, order: order ?? 0, startTime, endTime });
    res.status(201).json(slot);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// PUT /api/admin/tutoring-slots/:id
router.put('/tutoring-slots/:id', async (req, res) => {
  try {
    const slot = await TutoringSlot.findByPk(req.params.id);
    if (!slot) return res.status(404).json({ msg: 'Tutoring slot not found' });
    const { name, order, startTime, endTime } = req.body;
    await slot.update({ name, order, startTime, endTime });
    res.json(slot);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// DELETE /api/admin/tutoring-slots/:id
router.delete('/tutoring-slots/:id', async (req, res) => {
  try {
    const slot = await TutoringSlot.findByPk(req.params.id);
    if (!slot) return res.status(404).json({ msg: 'Tutoring slot not found' });
    await slot.destroy();
    res.json({ msg: 'Tutoring slot deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

// GET /api/admin/periods
router.get('/periods', async (req, res) => {
  try {
    const periods = await Period.findAll({ order: [['order', 'ASC']] });
    res.json(periods);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/admin/periods
// Body: { name, order }
router.post('/periods', async (req, res) => {
  try {
    const { name, order } = req.body;
    if (!name) return res.status(400).json({ msg: 'name is required' });
    const period = await Period.create({ name, order: order ?? 0 });
    res.status(201).json(period);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// PUT /api/admin/periods/:id
router.put('/periods/:id', async (req, res) => {
  try {
    const period = await Period.findByPk(req.params.id);
    if (!period) return res.status(404).json({ msg: 'Period not found' });
    const { name, order } = req.body;
    await period.update({ name, order });
    res.json(period);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// DELETE /api/admin/periods/:id
router.delete('/periods/:id', async (req, res) => {
  try {
    const period = await Period.findByPk(req.params.id);
    if (!period) return res.status(404).json({ msg: 'Period not found' });
    await period.destroy();
    res.json({ msg: 'Period deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
