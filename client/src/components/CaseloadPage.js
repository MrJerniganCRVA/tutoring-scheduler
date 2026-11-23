import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import apiService from '../utils/apiService';
import DateRangeFields, { defaultRange } from './DateRangeFields';
import TutoringSummaryTable from './TutoringSummaryTable';

// "My Caseload" - for case managers (SPED) to see how often the students on
// their caseload have been tutored, and by whom. The server only ever returns
// the signed-in teacher's own caseload (Enrollment period 'SPED').
const CaseloadPage = () => {
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    apiService.getCaseload(range)
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(err => { if (!cancelled) setError(apiService.formatError(err)); });
    return () => { cancelled = true; };
  }, [range]);

  const students = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!data) return [];
    if (!term) return data.students;
    return data.students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(term));
  }, [data, filter]);

  return (
    <Box sx={{ p: { xs: 0, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>My Caseload</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        How often each student on your caseload has been tutored, by whom, and for how many minutes. Minutes count only sessions the student attended; sessions their tutoring teacher marked absent are counted under Absences. Click a name to see each session.
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Find a student"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        <DateRangeFields range={range} onChange={setRange} />
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {!error && !data && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      )}
      {data && data.students.length === 0 && (
        <Alert severity="info">No students are on your caseload yet — ask an admin to add them.</Alert>
      )}
      {data && data.students.length > 0 && (
        students.length > 0
          ? <TutoringSummaryTable students={students} range={range} loadDetail={apiService.getCaseloadStudentSessions} />
          : <Alert severity="info">No caseload students match “{filter}”.</Alert>
      )}
    </Box>
  );
};

export default CaseloadPage;
