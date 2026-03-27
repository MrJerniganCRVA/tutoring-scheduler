import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  Checkbox,
  FormGroup,
  Divider,
  Chip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import apiService from '../utils/apiService';

// ─── Tutoring Slots Panel ─────────────────────────────────────────────────────

const EMPTY_SLOT = { name: '', startTime: '', endTime: '', order: '' };

function SlotsPanel() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = add, object = edit
  const [form, setForm] = useState(EMPTY_SLOT);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getTutoringSlots();
      setSlots(res.data);
    } catch (err) {
      setError(apiService.formatError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_SLOT);
    setDialogOpen(true);
  };

  const openEdit = (slot) => {
    setEditing(slot);
    setForm({ name: slot.name, startTime: slot.startTime || '', endTime: slot.endTime || '', order: slot.order ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        order: form.order !== '' ? parseInt(form.order, 10) : slots.length,
      };
      if (editing) {
        await apiService.updateTutoringSlot(editing.id, payload);
      } else {
        await apiService.createTutoringSlot(payload);
      }
      setSuccess(editing ? 'Slot updated.' : 'Slot created.');
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(apiService.formatError(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (slot) => { setDeleteTarget(slot); setDeleteDialogOpen(true); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiService.deleteTutoringSlot(deleteTarget.id);
      setSuccess('Slot deleted.');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(apiService.formatError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Tutoring Slots</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Slot</Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Define the time blocks when tutoring can occur (e.g., A Lunch, Study Hall, After School).
        Students and teachers are assigned to the slots they are available.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {loading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Start Time</TableCell>
                <TableCell>End Time</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {slots.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center">No slots configured yet.</TableCell></TableRow>
              ) : (
                slots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(slot => (
                  <TableRow key={slot.id}>
                    <TableCell>{slot.order ?? '—'}</TableCell>
                    <TableCell>{slot.name}</TableCell>
                    <TableCell>{slot.startTime || '—'}</TableCell>
                    <TableCell>{slot.endTime || '—'}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEdit(slot)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => confirmDelete(slot)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Edit Tutoring Slot' : 'Add Tutoring Slot'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required fullWidth />
          <TextField label="Start Time (HH:MM)" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} placeholder="e.g. 11:30" fullWidth />
          <TextField label="End Time (HH:MM)" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} placeholder="e.g. 12:05" fullWidth />
          <TextField label="Sort Order" type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs">
        <DialogTitle>Delete Slot?</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteTarget?.name}</strong>? This will remove it from all student and teacher assignments.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ─── Periods Panel ────────────────────────────────────────────────────────────

const EMPTY_PERIOD = { name: '', order: '' };

function PeriodsPanel() {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PERIOD);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getPeriods();
      setPeriods(res.data);
    } catch (err) {
      setError(apiService.formatError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_PERIOD); setDialogOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ name: p.name, order: p.order ?? '' }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { name: form.name.trim(), order: form.order !== '' ? parseInt(form.order, 10) : periods.length };
      if (editing) {
        await apiService.updatePeriod(editing.id, payload);
      } else {
        await apiService.createPeriod(payload);
      }
      setSuccess(editing ? 'Period updated.' : 'Period created.');
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(apiService.formatError(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (p) => { setDeleteTarget(p); setDeleteDialogOpen(true); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError('');
    try {
      await apiService.deletePeriod(deleteTarget.id);
      setSuccess('Period deleted.');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(apiService.formatError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Class Periods</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Period</Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Define your school's class periods or rotations (e.g., 1st Period, Block A, Rotation 3).
        Students are assigned a teacher for each period, which determines whose roster they appear on.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {loading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {periods.length === 0 ? (
                <TableRow><TableCell colSpan={3} align="center">No periods configured yet.</TableCell></TableRow>
              ) : (
                periods.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.order ?? '—'}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => confirmDelete(p)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? 'Edit Period' : 'Add Period'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required fullWidth />
          <TextField label="Sort Order" type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs">
        <DialogTitle>Delete Period?</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteTarget?.name}</strong>? This will remove all student period assignments for this period.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ─── School Config Panel ──────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ConfigPanel() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Local editable state
  const [schoolName, setSchoolName] = useState('');
  const [allowedEmailDomain, setAllowedEmailDomain] = useState('');
  const [calendarTimezone, setCalendarTimezone] = useState('');
  const [calendarEventPrefix, setCalendarEventPrefix] = useState('');
  const [tutoringPeriodName, setTutoringPeriodName] = useState('');
  const [noTutoringDays, setNoTutoringDays] = useState([]);
  const [priorityEnabled, setPriorityEnabled] = useState(false);
  const [priorityMap, setPriorityMap] = useState({}); // { "1": "Math", "4": "Science" }

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getAdminConfig();
      const byKey = res.data; // flat object: { school_name: '...', no_tutoring_days: [...], ... }
      setConfig(byKey);

      setSchoolName(byKey.school_name || '');
      setAllowedEmailDomain(byKey.allowed_email_domain || '');
      setCalendarTimezone(byKey.calendar_timezone || '');
      setCalendarEventPrefix(byKey.calendar_event_prefix || '');
      setTutoringPeriodName(byKey.tutoring_period_name || '');
      setNoTutoringDays(byKey.no_tutoring_days || []);
      setPriorityEnabled(byKey.subject_priority_enabled === true || byKey.subject_priority_enabled === 'true');
      setPriorityMap(byKey.subject_priority_map || {});
    } catch (err) {
      setError(apiService.formatError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleDay = (dayIndex) => {
    setNoTutoringDays(prev =>
      prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex]
    );
  };

  const setPrioritySubject = (dayIndex, subject) => {
    setPriorityMap(prev => ({ ...prev, [String(dayIndex)]: subject }));
  };

  const removePriorityDay = (dayIndex) => {
    setPriorityMap(prev => {
      const next = { ...prev };
      delete next[String(dayIndex)];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const updates = {
        school_name: schoolName,
        allowed_email_domain: allowedEmailDomain,
        calendar_timezone: calendarTimezone,
        calendar_event_prefix: calendarEventPrefix,
        tutoring_period_name: tutoringPeriodName,
        no_tutoring_days: noTutoringDays,
        subject_priority_enabled: priorityEnabled,
        subject_priority_map: priorityMap,
      };
      await apiService.updateAdminConfig(updates);
      setSuccess('Settings saved.');
      load();
    } catch (err) {
      setError(apiService.formatError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CircularProgress />;

  const availablePriorityDays = [1, 2, 3, 4, 5].filter(d => !noTutoringDays.includes(d));
  const priorityDaysInMap = Object.keys(priorityMap).map(Number);

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>School Settings</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

        {/* General */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>General</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="School Name"
              value={schoolName}
              onChange={e => setSchoolName(e.target.value)}
              fullWidth
              helperText="Displayed in the app header and calendar events."
            />
            <TextField
              label="Allowed Email Domain"
              value={allowedEmailDomain}
              onChange={e => setAllowedEmailDomain(e.target.value)}
              fullWidth
              placeholder="e.g. @myschool.edu"
              helperText="Google OAuth will only allow logins from this domain. Leave blank to allow all domains."
            />
          </Box>
        </Paper>

        {/* Calendar */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Calendar</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Timezone"
              value={calendarTimezone}
              onChange={e => setCalendarTimezone(e.target.value)}
              fullWidth
              placeholder="e.g. America/New_York"
              helperText="IANA timezone name used for Google Calendar events."
            />
            <TextField
              label="Calendar Event Prefix"
              value={calendarEventPrefix}
              onChange={e => setCalendarEventPrefix(e.target.value)}
              fullWidth
              placeholder="e.g. Tutoring"
              helperText="Prefix added to calendar invite titles."
            />
            <TextField
              label="Tutoring Period Name"
              value={tutoringPeriodName}
              onChange={e => setTutoringPeriodName(e.target.value)}
              fullWidth
              placeholder="e.g. Study Hall"
              helperText="The name of your school's tutoring/intervention period."
            />
          </Box>
        </Paper>

        {/* Scheduling */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Scheduling</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Select days when tutoring does <strong>not</strong> occur:
          </Typography>
          <FormGroup row sx={{ mb: 2 }}>
            {DAY_NAMES.map((name, i) => (
              <FormControlLabel
                key={i}
                control={<Checkbox checked={noTutoringDays.includes(i)} onChange={() => toggleDay(i)} />}
                label={name}
              />
            ))}
          </FormGroup>

          <Divider sx={{ my: 2 }} />

          <FormControlLabel
            control={<Switch checked={priorityEnabled} onChange={e => setPriorityEnabled(e.target.checked)} />}
            label="Enable subject priority scheduling"
          />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            When enabled, tutoring requests on a given day are prioritized for students in the specified subject.
          </Typography>

          {priorityEnabled && (
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                Day → Subject Priority Map
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Assign a subject to each tutoring day. Disabled days are not shown.
              </Typography>

              {/* Existing entries */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
                {priorityDaysInMap.sort((a, b) => a - b).map(dayIndex => (
                  <Box key={dayIndex} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={DAY_NAMES[dayIndex]} size="small" sx={{ minWidth: 90 }} />
                    <TextField
                      size="small"
                      label="Subject"
                      value={priorityMap[String(dayIndex)] || ''}
                      onChange={e => setPrioritySubject(dayIndex, e.target.value)}
                      sx={{ flex: 1 }}
                    />
                    <IconButton size="small" color="error" onClick={() => removePriorityDay(dayIndex)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>

              {/* Add new day button */}
              {availablePriorityDays.filter(d => !priorityDaysInMap.includes(d)).length > 0 && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {availablePriorityDays.filter(d => !priorityDaysInMap.includes(d)).map(d => (
                    <Button
                      key={d}
                      size="small"
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() => setPrioritySubject(d, '')}
                    >
                      {DAY_NAMES[d]}
                    </Button>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" size="large" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={22} /> : 'Save Settings'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Main AdminPanel ──────────────────────────────────────────────────────────

function AdminPanel() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Admin Panel</Typography>
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} indicatorColor="primary" textColor="primary">
          <Tab label="Tutoring Slots" />
          <Tab label="Class Periods" />
          <Tab label="School Settings" />
        </Tabs>
      </Paper>

      {tab === 0 && <SlotsPanel />}
      {tab === 1 && <PeriodsPanel />}
      {tab === 2 && <ConfigPanel />}
    </Box>
  );
}

export default AdminPanel;
