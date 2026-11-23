import React, { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography
} from '@mui/material';
import apiService from '../utils/apiService';

const fullName = (person) => `${person.first_name} ${person.last_name}`;

// "Are you covering today?" - lets a teacher covering someone else's Raptor
// Rotation see who should leave that room for tutoring today. The server only
// ever returns today's list and only student names (no tutoring teacher, no
// lunches), so this can't be used to browse who is being tutored by whom.
// Kept self-contained so it never disturbs the teacher's own RR board.
const CoverageDialog = ({ open, onClose }) => {
  const [teachers, setTeachers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [students, setStudents] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || teachers.length > 0) return;
    apiService.getRRTeachers()
      .then(res => setTeachers(res.data))
      .catch(err => setError(apiService.formatError(err)));
  }, [open, teachers.length]);

  useEffect(() => {
    if (!selected) {
      setStudents(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiService.getCoverageList(selected.id)
      .then(res => { if (!cancelled) setStudents(res.data.students); })
      .catch(err => { if (!cancelled) setError(apiService.formatError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const handleClose = () => {
    setSelected(null);
    setError(null);
    onClose();
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {selected ? `Covering ${fullName(selected)}'s RR` : 'Are you covering today?'}
        <Typography variant="body2" color="text.secondary">{today}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Autocomplete
          options={teachers}
          value={selected}
          onChange={(_, value) => setSelected(value)}
          getOptionLabel={fullName}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => (
            <TextField {...params} label="Whose RR are you covering?" autoFocus />
          )}
          sx={{ mb: 2 }}
        />

        {error && <Alert severity="error">{error}</Alert>}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!loading && students && (students.length > 0 ? (
          <>
            <Typography variant="subtitle2" color="text.secondary">
              Leaving RR today ({students.length})
            </Typography>
            <List dense>
              {students.map(student => (
                <ListItem key={student.id} disableGutters>
                  <ListItemText primary={fullName(student)} />
                </ListItem>
              ))}
            </List>
          </>
        ) : (
          <Alert severity="info">No one is leaving this RR for tutoring today.</Alert>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CoverageDialog;
