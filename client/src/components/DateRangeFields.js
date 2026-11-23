import React from 'react';
import { Stack, TextField } from '@mui/material';
import { schoolYearStartDateOnly, todayDateOnly } from '../utils/dates';

// Default window for every report-style view: this school year so far.
export const defaultRange = () => ({ from: schoolYearStartDateOnly(), to: todayDateOnly() });

// From/To date pickers shared by the admin trends, admin student lookup and
// caseload pages. Clearing a field is ignored so the range is always complete.
const DateRangeFields = ({ range, onChange }) => (
  <Stack direction="row" spacing={2}>
    <TextField
      type="date"
      size="small"
      label="From"
      value={range.from}
      onChange={e => e.target.value && onChange({ ...range, from: e.target.value })}
      InputLabelProps={{ shrink: true }}
    />
    <TextField
      type="date"
      size="small"
      label="To"
      value={range.to}
      onChange={e => e.target.value && onChange({ ...range, to: e.target.value })}
      InputLabelProps={{ shrink: true }}
    />
  </Stack>
);

export default DateRangeFields;
