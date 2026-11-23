import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormGroup,
  Grid,
  MenuItem,
  Paper,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import apiService from '../utils/apiService';
import { useSettings } from '../contexts/SettingsContext';

// Admin page for the school settings (server/utils/schoolSettings.js). The
// server validates everything; this page only shapes the form.

const WEEKDAYS = [
  { day: 1, name: 'Monday' },
  { day: 2, name: 'Tuesday' },
  { day: 3, name: 'Wednesday' },
  { day: 4, name: 'Thursday' },
  { day: 5, name: 'Friday' },
  { day: 6, name: 'Saturday' },
  { day: 0, name: 'Sunday' }
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// Server settings -> form state (plain strings and booleans for the inputs).
const toForm = (s) => ({
  schoolName: s.schoolName,
  homeroomLabel: s.homeroomLabel,
  homeroomShortLabel: s.homeroomShortLabel,
  calendarEventPrefix: s.calendarEventPrefix,
  priorityByWeekday: Object.fromEntries(WEEKDAYS.map(({ day }) => [day, s.priorityByWeekday[day] || ''])),
  noTutoringWeekdays: s.noTutoringWeekdays,
  schoolYearMonth: s.schoolYearStart.month,
  schoolYearDay: String(s.schoolYearStart.day),
  gradeLevelsEnabled: s.gradeLevels.enabled,
  gradeLabels: s.gradeLevels.labels.join(', ')
});

// Form state -> the PUT body.
const fromForm = (f) => ({
  schoolName: f.schoolName,
  homeroomLabel: f.homeroomLabel,
  homeroomShortLabel: f.homeroomShortLabel,
  calendarEventPrefix: f.calendarEventPrefix,
  priorityByWeekday: f.priorityByWeekday,
  noTutoringWeekdays: f.noTutoringWeekdays,
  schoolYearStart: { month: Number(f.schoolYearMonth), day: Number(f.schoolYearDay) },
  gradeLevels: {
    enabled: f.gradeLevelsEnabled,
    labels: f.gradeLabels.split(',').map(l => l.trim()).filter(Boolean)
  }
});

const Section = ({ title, hint, children }) => (
  <Paper sx={{ p: 3, mb: 3 }}>
    <Typography variant="h6">{title}</Typography>
    {hint && <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{hint}</Typography>}
    {children}
  </Paper>
);

const SchoolSettingsPage = () => {
  const { refreshSettings } = useSettings();
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    apiService.getAdminSettings()
      .then(res => setForm(toForm(res.data)))
      .catch(err => setLoadError(apiService.formatError(err)));
  }, []);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const setPriority = (day) => (e) =>
    setForm(prev => ({ ...prev, priorityByWeekday: { ...prev.priorityByWeekday, [day]: e.target.value } }));

  const toggleNoTutoring = (day) => (e) =>
    setForm(prev => ({
      ...prev,
      noTutoringWeekdays: e.target.checked
        ? [...prev.noTutoringWeekdays, day]
        : prev.noTutoringWeekdays.filter(d => d !== day)
    }));

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await apiService.updateSettings(fromForm(form));
      setForm(toForm(res.data));
      await refreshSettings();
      setResult({ severity: 'success', message: 'Settings saved.' });
    } catch (err) {
      setResult({ severity: 'error', message: err.response?.data?.msg || apiService.formatError(err) });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <Alert severity="error">{loadError}</Alert>;
  if (!form) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>School Settings</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        These rules apply to everyone at your school as soon as you save.
      </Typography>

      <Section title="Names">
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField fullWidth label="School name" value={form.schoolName} onChange={set('schoolName')}
              helperText="Shown in the header. Leave blank for “Tutoring Scheduler”." />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField fullWidth label="Calendar invite title" value={form.calendarEventPrefix} onChange={set('calendarEventPrefix')}
              helperText="Invites are titled “<this> - <teacher's subject>”." />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField fullWidth label="Homeroom period name" value={form.homeroomLabel} onChange={set('homeroomLabel')}
              helperText="The period students leave for tutoring, e.g. Raptor Rotation, Advisory." />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField fullWidth label="Short name" value={form.homeroomShortLabel} onChange={set('homeroomShortLabel')}
              helperText="Used in labels like “Leaving RR Today”." />
          </Grid>
        </Grid>
      </Section>

      <Section
        title="Tutoring days and priority"
        hint="On its day, a teacher of the priority subject can override another subject's booking. Subjects must match teachers' subjects exactly. Leave blank for first come, first served."
      >
        <Grid container spacing={2}>
          {WEEKDAYS.map(({ day, name }) => {
            const blocked = form.noTutoringWeekdays.includes(day);
            return (
              <Grid item xs={12} sm={6} md={4} key={day}>
                <TextField
                  fullWidth
                  size="small"
                  label={`${name} priority subject`}
                  value={form.priorityByWeekday[day]}
                  onChange={setPriority(day)}
                  disabled={blocked}
                />
                <FormGroup>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={blocked} onChange={toggleNoTutoring(day)} />}
                    label={`No tutoring on ${name}s`}
                  />
                </FormGroup>
              </Grid>
            );
          })}
        </Grid>
      </Section>

      <Section title="School year" hint="Date ranges on reports default to this date through today.">
        <Grid container spacing={2}>
          <Grid item xs={8} md={4}>
            <TextField select fullWidth label="Starts in" value={form.schoolYearMonth} onChange={set('schoolYearMonth')}>
              {MONTHS.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={4} md={2}>
            <TextField fullWidth label="Day" type="number" inputProps={{ min: 1, max: 31 }}
              value={form.schoolYearDay} onChange={set('schoolYearDay')} />
          </Grid>
        </Grid>
      </Section>

      <Section
        title="Grade levels"
        hint="The admin dashboard works out a student's grade from the first two digits of their student ID (the year they started). Turn this off if your IDs don't work that way."
      >
        <FormControlLabel
          control={<Switch checked={form.gradeLevelsEnabled}
            onChange={e => setForm(prev => ({ ...prev, gradeLevelsEnabled: e.target.checked }))} />}
          label="Show sessions by grade level"
        />
        <TextField fullWidth sx={{ mt: 2 }} label="Grade names, first year first" value={form.gradeLabels}
          onChange={set('gradeLabels')} disabled={!form.gradeLevelsEnabled}
          helperText="Comma-separated, e.g. 9th, 10th, 11th, 12th" />
      </Section>

      {result && <Alert severity={result.severity} sx={{ mb: 2 }}>{result.message}</Alert>}
      <Button variant="contained" size="large" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </Box>
  );
};

export default SchoolSettingsPage;
