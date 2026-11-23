import React from 'react';
import { Box, Button, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import { Undo as UndoIcon } from '@mui/icons-material';
import { useTutoring } from '../contexts/TutoringContext';
import { todayDateOnly } from '../utils/dates';

// The attendance cell for one of this teacher's own requests. Students are
// assumed present, so the only action is the exception: one tap marks a
// no-show, and the undo next to the chip puts it back. No confirm step -
// undoing is just as quick. Sessions that haven't happened yet can't be marked.
const AttendanceToggle = ({ request }) => {
  const { setAttendance } = useTutoring();

  if (request.date > todayDateOnly()) {
    return <Typography variant="body2" color="text.secondary">—</Typography>;
  }

  if (request.absent) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Chip label="Absent" color="warning" size="small" />
        <Tooltip title="Mark present">
          <IconButton size="small" aria-label="Mark present" onClick={() => setAttendance(request.id, false)}>
            <UndoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Button
      variant="outlined"
      color="warning"
      size="small"
      onClick={() => setAttendance(request.id, true)}
    >
      Mark absent
    </Button>
  );
};

export default AttendanceToggle;
