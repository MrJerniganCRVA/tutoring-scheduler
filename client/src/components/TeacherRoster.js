import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Chip,
  Alert,
  CircularProgress
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import apiService from '../utils/apiService';
import BulkTeacherImport from './BulkTeacherImport';

const LUNCHES = ['A', 'B', 'C', 'D'];

const emptyAddState = { id: '', first_name: '', last_name: '', email: '', subject: '', lunch: '' };
const emptyEditState = { first_name: '', last_name: '', email: '', subject: '', lunch: '', is_admin: false, active: true };

const TeacherRoster = ({ currentUserId }) => {
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editTeacher, setEditTeacher] = useState(null);
  const [editFields, setEditFields] = useState(emptyEditState);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addFields, setAddFields] = useState(emptyAddState);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiService.getTeachers();
      setTeachers(res.data);
    } catch (e) {
      setError('Failed to load teachers. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTeachers = teachers.filter(t => {
    const full = `${t.first_name} ${t.last_name} ${t.email}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  const openEdit = (teacher) => {
    setEditTeacher(teacher);
    setEditFields({
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      email: teacher.email,
      subject: teacher.subject,
      lunch: teacher.lunch ?? '',
      is_admin: teacher.is_admin,
      active: teacher.active
    });
    setEditError('');
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    setEditSaving(true);
    setEditError('');
    try {
      await apiService.updateTeacher(editTeacher.id, {
        ...editFields,
        lunch: editFields.lunch || null
      });
      setEditOpen(false);
      await fetchData();
    } catch (e) {
      setEditError(e.response?.data?.msg || 'Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  };

  const openAdd = () => {
    setAddFields(emptyAddState);
    setAddError('');
    setAddOpen(true);
  };

  const handleAddSave = async () => {
    if (!addFields.id || !String(addFields.id).trim()) {
      setAddError('Teacher ID is required.');
      return;
    }
    if (!addFields.first_name.trim() || !addFields.last_name.trim()) {
      setAddError('First and last name are required.');
      return;
    }
    if (!addFields.email.trim()) {
      setAddError('Email is required.');
      return;
    }
    if (!addFields.subject.trim()) {
      setAddError('Subject is required.');
      return;
    }
    setAddSaving(true);
    setAddError('');
    try {
      await apiService.createTeacher({
        id: Number(addFields.id),
        first_name: addFields.first_name.trim(),
        last_name: addFields.last_name.trim(),
        email: addFields.email.trim(),
        subject: addFields.subject.trim(),
        lunch: addFields.lunch || null
      });
      setAddOpen(false);
      await fetchData();
    } catch (e) {
      setAddError(e.response?.data?.msg || 'Failed to add teacher.');
    } finally {
      setAddSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Teacher Roster</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<GroupAddIcon />}
            onClick={() => setBulkImportOpen(true)}
          >
            Bulk Import Teachers
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PersonAddIcon />}
            onClick={openAdd}
          >
            Add Teacher
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TextField
        label="Search teachers"
        variant="outlined"
        size="small"
        value={search}
        onChange={e => setSearch(e.target.value)}
        sx={{ mb: 2, width: 280 }}
      />

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><strong>Teacher</strong></TableCell>
              <TableCell><strong>Email</strong></TableCell>
              <TableCell><strong>Subject</strong></TableCell>
              <TableCell align="center"><strong>Lunch</strong></TableCell>
              <TableCell align="center"><strong>Admin</strong></TableCell>
              <TableCell align="center"><strong>Status</strong></TableCell>
              <TableCell align="center"><strong>Edit</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTeachers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">No teachers found.</TableCell>
              </TableRow>
            ) : (
              filteredTeachers.map(teacher => (
                <TableRow key={teacher.id} hover>
                  <TableCell>{teacher.first_name} {teacher.last_name}</TableCell>
                  <TableCell>{teacher.email}</TableCell>
                  <TableCell>{teacher.subject}</TableCell>
                  <TableCell align="center">{teacher.lunch ?? '—'}</TableCell>
                  <TableCell align="center">
                    {teacher.is_admin && <Chip label="Admin" color="primary" size="small" />}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={teacher.active ? 'Active' : 'Inactive'}
                      color={teacher.active ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small" color="primary" onClick={() => openEdit(teacher)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Edit — {editTeacher?.first_name} {editTeacher?.last_name}
        </DialogTitle>
        <DialogContent>
          {editError && <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>}
          <TextField
            label="First Name"
            fullWidth
            margin="dense"
            value={editFields.first_name}
            onChange={e => setEditFields(prev => ({ ...prev, first_name: e.target.value }))}
          />
          <TextField
            label="Last Name"
            fullWidth
            margin="dense"
            value={editFields.last_name}
            onChange={e => setEditFields(prev => ({ ...prev, last_name: e.target.value }))}
          />
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="dense"
            value={editFields.email}
            onChange={e => setEditFields(prev => ({ ...prev, email: e.target.value }))}
          />
          <TextField
            label="Subject"
            fullWidth
            margin="dense"
            value={editFields.subject}
            onChange={e => setEditFields(prev => ({ ...prev, subject: e.target.value }))}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Lunch</InputLabel>
            <Select
              label="Lunch"
              value={editFields.lunch}
              onChange={e => setEditFields(prev => ({ ...prev, lunch: e.target.value }))}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {LUNCHES.map(l => <MenuItem key={l} value={l}>{l}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Checkbox
                checked={editFields.active}
                onChange={e => setEditFields(prev => ({ ...prev, active: e.target.checked }))}
              />
            }
            label="Active"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={editFields.is_admin}
                disabled={editTeacher?.id === currentUserId}
                onChange={e => setEditFields(prev => ({ ...prev, is_admin: e.target.checked }))}
              />
            }
            label={editTeacher?.id === currentUserId ? 'Admin (cannot remove your own access)' : 'Admin'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleEditSave}
            disabled={editSaving}
          >
            {editSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Teacher</DialogTitle>
        <DialogContent>
          {addError && <Alert severity="error" sx={{ mb: 2 }}>{addError}</Alert>}
          <TextField
            label="Teacher ID"
            fullWidth
            margin="dense"
            value={addFields.id}
            onChange={e => setAddFields(prev => ({ ...prev, id: e.target.value }))}
            inputProps={{ inputMode: 'numeric' }}
          />
          <TextField
            label="First Name"
            fullWidth
            margin="dense"
            value={addFields.first_name}
            onChange={e => setAddFields(prev => ({ ...prev, first_name: e.target.value }))}
          />
          <TextField
            label="Last Name"
            fullWidth
            margin="dense"
            value={addFields.last_name}
            onChange={e => setAddFields(prev => ({ ...prev, last_name: e.target.value }))}
          />
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="dense"
            value={addFields.email}
            onChange={e => setAddFields(prev => ({ ...prev, email: e.target.value }))}
          />
          <TextField
            label="Subject"
            fullWidth
            margin="dense"
            value={addFields.subject}
            onChange={e => setAddFields(prev => ({ ...prev, subject: e.target.value }))}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Lunch</InputLabel>
            <Select
              label="Lunch"
              value={addFields.lunch}
              onChange={e => setAddFields(prev => ({ ...prev, lunch: e.target.value }))}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {LUNCHES.map(l => <MenuItem key={l} value={l}>{l}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={addSaving}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleAddSave}
            disabled={addSaving}
          >
            {addSaving ? 'Saving…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Teacher Import Dialog */}
      <BulkTeacherImport
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onComplete={fetchData}
        teachers={teachers}
      />
    </Box>
  );
};

export default TeacherRoster;
