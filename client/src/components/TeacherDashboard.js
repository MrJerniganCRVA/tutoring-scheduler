import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Card,
    CardActionArea,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
    Link,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import apiService from '../utils/apiService';
import DateRangeFields, { defaultRange } from './DateRangeFields';
import StudentSessionsDialog from './StudentSessionsDialog';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const BLUE = '#249DD7';
const GREEN = '#8FC745';
const PINK = '#EC3984';

// 'YYYY-MM-DD' -> local date, so a DATEONLY never shifts a day.
const parseDay = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
};
const formatDate = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
    parseDay(iso).toLocaleDateString('en-US', opts);

const lunchLabel = (s) => s.lunches.map((l, i) => `${l} (${s.times[i]})`).join(', ');

const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
};

const StatCard = ({ label, value, color, caption, onClick }) => {
    const content = (
        <CardContent sx={{ textAlign: 'center' }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
            <Typography variant="h3" sx={{ color, fontWeight: 'bold', my: 1 }}>{value}</Typography>
            {caption && <Typography variant="body2" color="text.secondary">{caption}</Typography>}
        </CardContent>
    );
    return (
        <Card sx={{ borderTop: 4, borderColor: color, height: '100%' }}>
            {onClick ? <CardActionArea onClick={onClick} sx={{ height: '100%' }}>{content}</CardActionArea> : content}
        </Card>
    );
};

const ChartCard = ({ title, children }) => (
    <Card sx={{ height: '100%' }}>
        <CardContent>
            <Typography variant="h6" sx={{ mb: 2, pb: 1, borderBottom: 2, borderColor: '#D0E9FA' }}>{title}</Typography>
            <Box sx={{ height: 300, position: 'relative' }}>{children}</Box>
        </CardContent>
    </Card>
);

const barData = (labels, data, color) => ({
    labels,
    datasets: [{ label: 'Sessions', data, backgroundColor: `${color}CC`, borderColor: color, borderWidth: 2 }]
});

// Sortable columns of My Students; ties fall back to name order (the order
// the server returns).
const SORTS = {
    name: { label: 'Student', compare: () => 0 },
    totalSessions: { label: 'Sessions', compare: (a, b) => a.totalSessions - b.totalSessions },
    totalAbsences: { label: 'Absences', compare: (a, b) => a.totalAbsences - b.totalAbsences },
    lastSession: { label: 'Last session', compare: (a, b) => (a.lastSession || '').localeCompare(b.lastSession || '') }
};

// Which students My Students shows. 'notTutored' is class students with no
// attended session in the range - the "Not yet tutored" card links here.
const SHOW = {
    all: { label: 'All', match: () => true },
    tutored: { label: 'Tutored', match: s => s.totalSessions > 0 || s.totalAbsences > 0 },
    notTutored: { label: 'Not yet tutored', match: s => s.inClass && s.totalSessions === 0 }
};

// Every student the teacher teaches (any period) or tutored in the range,
// with only this teacher's sessions counted. Clicking a name lists each of
// those sessions with its date and lunch times. Students on a SPED caseload
// are flagged with their case manager, since their minutes are being tracked.
const MyStudents = React.forwardRef(({ teacherId, range, show, onShowChange }, ref) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('');
    const [sort, setSort] = useState({ by: 'totalSessions', desc: true });
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setData(null);
        setError(null);
        apiService.getTeacherStudents(teacherId, range)
            .then(res => { if (!cancelled) setData(res.data); })
            .catch(err => { if (!cancelled) setError(apiService.formatError(err)); });
        return () => { cancelled = true; };
    }, [teacherId, range]);

    const students = useMemo(() => {
        if (!data) return [];
        const term = filter.trim().toLowerCase();
        const rows = data.students.filter(s =>
            SHOW[show].match(s) &&
            (!term || `${s.first_name} ${s.last_name}`.toLowerCase().includes(term))
        );
        const { compare } = SORTS[sort.by];
        return rows
            .map((s, i) => ({ s, i }))
            .sort((a, b) => (sort.desc ? -1 : 1) * compare(a.s, b.s) || a.i - b.i)
            .map(({ s }) => s);
    }, [data, filter, show, sort]);

    const loadDetail = useMemo(
        () => (studentId, params) => apiService.getTeacherStudentSessions(teacherId, studentId, params),
        [teacherId]
    );

    const sortBy = (by) => setSort(prev => ({ by, desc: prev.by === by ? !prev.desc : by !== 'name' }));

    return (
        <Card sx={{ mt: 3 }} ref={ref}>
            <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mb: 2, pb: 1, borderBottom: 2, borderColor: '#D0E9FA' }}>
                    <Typography variant="h6">My Students</Typography>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <ToggleButtonGroup size="small" exclusive value={show} onChange={(_, value) => value && onShowChange(value)}>
                            {Object.entries(SHOW).map(([key, { label }]) => (
                                <ToggleButton key={key} value={key}>{label}</ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <TextField size="small" label="Find a student" value={filter} onChange={e => setFilter(e.target.value)} sx={{ minWidth: 220 }} />
                    </Stack>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Students in your classes (not RR) and anyone you tutored in this date range. Counts are your sessions only. Click a name to see each session's date and time.
                </Typography>

                {error && <Alert severity="error">{error}</Alert>}
                {!error && !data && <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>}
                {data && data.students.length === 0 && <Alert severity="info">No students yet — none are enrolled in your classes and you haven't tutored anyone in this range.</Alert>}
                {data && data.students.length > 0 && students.length === 0 && <Alert severity="info">No students match.</Alert>}
                {students.length > 0 && (
                    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 560 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    {Object.entries(SORTS).map(([key, { label }]) => (
                                        <TableCell key={key} align={key === 'name' || key === 'lastSession' ? 'left' : 'right'}>
                                            <TableSortLabel active={sort.by === key} direction={sort.by === key && sort.desc ? 'desc' : 'asc'} onClick={() => sortBy(key)}>
                                                <strong>{label}</strong>
                                            </TableSortLabel>
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {students.map(s => (
                                    <TableRow key={s.id} hover>
                                        <TableCell>
                                            <Link component="button" variant="body2" onClick={() => setSelected(s)} sx={{ textAlign: 'left' }}>
                                                {s.last_name}, {s.first_name}
                                            </Link>
                                            {s.caseManager && (
                                                <Chip
                                                    size="small"
                                                    color="secondary"
                                                    variant="outlined"
                                                    label={`SPED · ${s.caseManager.first_name} ${s.caseManager.last_name}`}
                                                    sx={{ ml: 1 }}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>{s.totalSessions}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600, color: s.totalAbsences > 0 ? 'warning.main' : 'text.secondary' }}>
                                            {s.totalAbsences}
                                        </TableCell>
                                        <TableCell>
                                            {s.lastSession ? formatDate(s.lastSession) : <Typography variant="body2" color="text.secondary">—</Typography>}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </CardContent>
            <StudentSessionsDialog student={selected} range={range} loadDetail={loadDetail} onClose={() => setSelected(null)} ownSessions />
        </Card>
    );
});

// A teacher's own tutoring over a date range (default: this school year so
// far): what they delivered, when, what's coming up, and every student they
// teach or tutor.
const TeacherDashboard = () => {
    const teacherId = localStorage.getItem('teacherId');
    const [range, setRange] = useState(defaultRange);
    const [overview, setOverview] = useState(null);
    const [error, setError] = useState(null);
    const [show, setShow] = useState('all');
    const studentsRef = useRef(null);

    const showNotTutored = () => {
        setShow('notTutored');
        studentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    useEffect(() => {
        if (!teacherId) return;
        let cancelled = false;
        setOverview(null);
        setError(null);
        apiService.getTeacherAnalytics(teacherId, range)
            .then(res => { if (!cancelled) setOverview(res.data); })
            .catch(err => { if (!cancelled) setError(apiService.formatError(err)); });
        return () => { cancelled = true; };
    }, [teacherId, range]);

    if (!teacherId) return null;

    const booked = overview ? overview.sessions + overview.absences : 0;

    return (
        <Box sx={{ p: { xs: 0, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mb: 3 }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>Analytics</Typography>
                <DateRangeFields range={range} onChange={setRange} />
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
            {!error && !overview && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

            {overview && (
                <>
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard label="Sessions delivered" value={overview.sessions} color={BLUE} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard
                                label="Not yet tutored"
                                value={overview.notYetTutored}
                                color={GREEN}
                                caption={overview.classStudents > 0 ? `of ${overview.classStudents} class students` : null}
                                onClick={overview.notYetTutored > 0 ? showNotTutored : undefined}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard label="Students tutored" value={overview.uniqueStudents} color={PINK} />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatCard
                                label="Absences"
                                value={overview.absences}
                                color="#F5A623"
                                caption={booked > 0 ? `${Math.round((overview.sessions / booked) * 100)}% attendance` : null}
                            />
                        </Grid>
                    </Grid>

                    <Grid container spacing={3}>
                        <Grid item xs={12} md={7}>
                            <ChartCard title="Sessions per Week">
                                <Bar
                                    options={chartOptions}
                                    data={barData(
                                        overview.weekly.map(w => formatDate(w.weekOf, { month: 'short', day: 'numeric' })),
                                        overview.weekly.map(w => w.sessions),
                                        BLUE
                                    )}
                                />
                            </ChartCard>
                        </Grid>
                        <Grid item xs={12} md={5}>
                            <ChartCard title="Sessions by Day of Week">
                                <Bar
                                    options={chartOptions}
                                    data={barData(overview.dayOfWeek.map(d => d.day), overview.dayOfWeek.map(d => d.sessions), GREEN)}
                                />
                            </ChartCard>
                        </Grid>
                    </Grid>

                    <Card sx={{ mt: 3 }}>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 2, pb: 1, borderBottom: 2, borderColor: '#D0E9FA' }}>Your Upcoming Sessions</Typography>
                            {overview.upcoming.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">Nothing booked from today on.</Typography>
                            ) : (
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell><strong>Date</strong></TableCell>
                                                <TableCell><strong>Lunch</strong></TableCell>
                                                <TableCell><strong>Student</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {overview.upcoming.map(s => (
                                                <TableRow key={s.id}>
                                                    <TableCell>{formatDate(s.date)}</TableCell>
                                                    <TableCell>{lunchLabel(s)}</TableCell>
                                                    <TableCell>{s.studentName}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            <MyStudents ref={studentsRef} teacherId={teacherId} range={range} show={show} onShowChange={setShow} />
        </Box>
    );
};

export default TeacherDashboard;
