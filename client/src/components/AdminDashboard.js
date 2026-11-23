import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Pie, Bar, Line } from 'react-chartjs-2';
import apiService from '../utils/apiService';
import { todayDateOnly } from '../utils/dates';
import DateRangeFields, { defaultRange } from './DateRangeFields';
import TutoringSummaryTable from './TutoringSummaryTable';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

// Same palette as TeacherDashboard so the two pages read as one app.
const BLUE = '#249DD7';
const PINK = '#EC3984';
const GREEN = '#8FC745';
const LIGHT_BLUE = '#79C1F1';
const PALETTE = [BLUE, PINK, GREEN, LIGHT_BLUE, '#F2A93B', '#8E6CCF'];
const withAlpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'top' } }
};
// Bar/line charts count whole sessions, so no 0.5-style ticks.
const noLegend = {
  ...chartOptions,
  plugins: { legend: { display: false } },
  scales: { x: { ticks: { precision: 0 } }, y: { ticks: { precision: 0 } } }
};

const barData = (labels, values, color, label = 'Sessions') => ({
  labels,
  datasets: [{ label, data: values, backgroundColor: withAlpha(color, 0.8), borderColor: color, borderWidth: 2 }]
});

const StatCard = ({ label, value, color, caption }) => (
  <Card sx={{ borderTop: 4, borderColor: color, height: '100%' }}>
    <CardContent sx={{ textAlign: 'center' }}>
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h3" sx={{ color, fontWeight: 'bold', my: 1 }}>
        {value}
      </Typography>
      {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
    </CardContent>
  </Card>
);

const ChartCard = ({ title, height = 320, children }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Typography variant="h6" sx={{ mb: 2, pb: 1, borderBottom: 2, borderColor: '#D0E9FA' }}>
        {title}
      </Typography>
      <Box sx={{ height, position: 'relative' }}>{children}</Box>
    </CardContent>
  </Card>
);

// Look up any student's tutoring, by tutoring teacher. Teachers only ever see
// their own SPED caseload (CaseloadPage); admins can pick anyone here. The
// student list is fetched the first time the picker is opened.
const StudentLookup = () => {
  const [students, setStudents] = useState(null);
  const [selected, setSelected] = useState(null);
  const [range, setRange] = useState(defaultRange);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const loadStudents = () => {
    if (students) return;
    setStudents([]);
    apiService.getStudents()
      .then(res => setStudents(
        [...res.data].sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))
      ))
      .catch(err => setError(apiService.formatError(err)));
  };

  useEffect(() => {
    if (!selected) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setResult(null);
    setError(null);
    apiService.getStudentTutoring(selected.id, range)
      .then(res => { if (!cancelled) setResult(res.data.student); })
      .catch(err => { if (!cancelled) setError(apiService.formatError(err)); });
    return () => { cancelled = true; };
  }, [selected, range]);

  return (
    <>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mt: 5, mb: 2 }}>
        <Typography variant="h5">Student Lookup</Typography>
        <DateRangeFields range={range} onChange={setRange} />
      </Stack>
      <Autocomplete
        options={students || []}
        loading={students !== null && students.length === 0}
        onOpen={loadStudents}
        value={selected}
        onChange={(_, value) => setSelected(value)}
        getOptionLabel={s => `${s.last_name}, ${s.first_name}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        // Keyed by id so two students who share a name both stay selectable.
        renderOption={(props, s) => <li {...props} key={s.id}>{s.last_name}, {s.first_name}</li>}
        renderInput={params => <TextField {...params} label="Search by name" size="small" />}
        sx={{ maxWidth: 480, mb: 2 }}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {selected && !result && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={28} /></Box>
      )}
      {result && <TutoringSummaryTable students={[result]} range={range} loadDetail={apiService.getStudentSessions} />}
    </>
  );
};

// Just what an admin needs at a glance: whose priority day it is, and how
// many students will be moving around. A student can only be booked once a
// day, so the student count is also the session count.
// With responseType 'blob', an error body arrives as a Blob too.
async function blobErrorMessage(err) {
  try {
    const text = await err.response?.data?.text?.();
    return JSON.parse(text).msg;
  } catch {
    return apiService.formatError(err);
  }
}

const TodaySection = ({ today }) => {
  const [filter, setFilter] = useState('');
  const term = filter.trim().toLowerCase();
  const rows = term
    ? today.leaving.filter(r => r.studentName.toLowerCase().includes(term))
    : today.leaving;

  return (
    <>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6}>
          <StatCard label="Priority today" value={today.prioritySubject || 'No tutoring'} color={PINK} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <StatCard label="Students leaving RR" value={today.uniqueStudents} color={GREEN} />
        </Grid>
      </Grid>

      {/* One row per student so an admin can check a student they meet in the
          hall: are they supposed to be traveling, from where, to whom, when. */}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 1 }}>
        <Typography variant="h6">Leaving RR Today</Typography>
        <TextField
          size="small"
          label="Find a student"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          sx={{ minWidth: 240 }}
        />
      </Stack>
      {today.leaving.length === 0 ? (
        <Alert severity="info">No one is leaving RR for tutoring today.</Alert>
      ) : rows.length === 0 ? (
        <Alert severity="info">No students match “{filter}”.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell><strong>Student</strong></TableCell>
                <TableCell><strong>Leaving From</strong></TableCell>
                <TableCell><strong>Going To</strong></TableCell>
                <TableCell><strong>Lunch</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.studentId} hover>
                  <TableCell>{r.studentName}</TableCell>
                  <TableCell>{r.leavingFrom ?? 'No RR assigned'}</TableCell>
                  <TableCell>{r.goingTo}</TableCell>
                  <TableCell>{r.lunches.join(', ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
};

const TrendsSection = ({ trends }) => {
  const departments = Object.keys(trends.byDepartment);
  const topTeachers = trends.byTeacher.slice(0, 15);
  const weekLabel = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const cancelled = trends.byStatus.cancelled || 0;
  // totalSessions counts attended sessions only; absences are booked sessions
  // the tutoring teacher marked as a no-show.
  const absences = trends.absences || 0;
  const booked = trends.totalSessions + absences;
  const absenceRate = booked > 0 ? Math.round((absences / booked) * 100) : 0;

  return (
    <>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={6} md>
          <StatCard label="Sessions attended" value={trends.totalSessions} color={BLUE} />
        </Grid>
        <Grid item xs={6} md>
          <StatCard
            label="Absences"
            value={absences}
            color="warning.main"
            caption={`${absenceRate}% of booked sessions`}
          />
        </Grid>
        <Grid item xs={6} md>
          <StatCard label="Students tutored" value={trends.uniqueStudents} color={GREEN} />
        </Grid>
        <Grid item xs={6} md>
          <StatCard label="Student never tutored" value={trends.activeStudentsWithoutSessions} color={PINK} />
        </Grid>
        <Grid item xs={12} md>
          <StatCard label="Cancelled / overridden" value={cancelled} color={LIGHT_BLUE} />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <ChartCard title="Sessions per Week" height={280}>
            <Line
              data={{
                labels: trends.byWeek.map(w => weekLabel(w.week)),
                datasets: [{
                  label: 'Sessions',
                  data: trends.byWeek.map(w => w.sessions),
                  borderColor: BLUE,
                  backgroundColor: withAlpha(BLUE, 0.2),
                  tension: 0.25
                }]
              }}
              options={noLegend}
            />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={6}>
          <ChartCard title="Sessions by Department">
            <Pie
              data={{
                labels: departments,
                datasets: [{
                  data: Object.values(trends.byDepartment),
                  backgroundColor: departments.map((_, i) => withAlpha(PALETTE[i % PALETTE.length], 0.8)),
                  borderColor: departments.map((_, i) => PALETTE[i % PALETTE.length]),
                  borderWidth: 2
                }]
              }}
              options={chartOptions}
            />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={6}>
          <ChartCard title="Sessions by Grade Level">
            <Bar data={barData(Object.keys(trends.byGradeLevel), Object.values(trends.byGradeLevel), GREEN)} options={noLegend} />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={6}>
          <ChartCard title="Sessions by Day of Week">
            <Bar data={barData(Object.keys(trends.byDayOfWeek), Object.values(trends.byDayOfWeek), BLUE)} options={noLegend} />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={6}>
          <ChartCard title={`Sessions by Teacher${trends.byTeacher.length > 15 ? ' (top 15)' : ''}`}>
            <Bar
              data={barData(topTeachers.map(t => t.name), topTeachers.map(t => t.sessions), PINK)}
              options={{
                ...noLegend,
                indexAxis: 'y',
                plugins: {
                  ...noLegend.plugins,
                  tooltip: {
                    callbacks: {
                      afterLabel: (ctx) => `${topTeachers[ctx.dataIndex].subject} · ${topTeachers[ctx.dataIndex].percentile}th percentile`
                    }
                  }
                }
              }}
            />
          </ChartCard>
        </Grid>
      </Grid>
    </>
  );
};

const AdminDashboard = () => {
  const [today, setToday] = useState(null);
  const [trends, setTrends] = useState(null);
  const [range, setRange] = useState(defaultRange);
  const [error, setError] = useState(null);
  const [report, setReport] = useState({ loading: false, error: null });

  useEffect(() => {
    apiService.getAdminToday()
      .then(res => setToday(res.data))
      .catch(err => setError(apiService.formatError(err)));
  }, []);

  const loadTrends = useCallback(() => {
    setTrends(null);
    apiService.getAdminTrends(range)
      .then(res => setTrends(res.data))
      .catch(err => setError(apiService.formatError(err)));
  }, [range]);

  useEffect(() => { loadTrends(); }, [loadTrends]);

  const handleDownload = async () => {
    setReport({ loading: true, error: null });
    try {
      const res = await apiService.downloadReport();
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tutoring_report_${todayDateOnly()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setReport({ loading: false, error: null });
    } catch (err) {
      setReport({ loading: false, error: await blobErrorMessage(err) });
    }
  };

  const loading = <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 0, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>Admin Dashboard</Typography>
        <Box sx={{ textAlign: { sm: 'right' } }}>
          <Button
            variant="contained"
            startIcon={report.loading ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />}
            onClick={handleDownload}
            disabled={report.loading}
          >
            {report.loading ? 'Generating report…' : 'Download full report'}
          </Button>
          {report.loading && (
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
              The first run can take a little while as the report service wakes up.
            </Typography>
          )}
        </Box>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {report.error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setReport({ loading: false, error: null })}>
          {report.error}
        </Alert>
      )}

      <Typography variant="h5" sx={{ mb: 2 }}>
        Today{today && ` — ${new Date(`${today.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
      </Typography>
      {today ? <TodaySection today={today} /> : !error && loading}

      <StudentLookup />

      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mt: 5, mb: 2 }}>
        <Typography variant="h5">School-wide Trends</Typography>
        <DateRangeFields range={range} onChange={setRange} />
      </Stack>
      {trends ? <TrendsSection trends={trends} /> : !error && loading}
    </Box>
  );
};

export default AdminDashboard;
