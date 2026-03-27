import React, { useEffect } from 'react';
import { Box, Typography, Alert, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import TutoringRequestListSimple from './TutoringRequestListSimple';
import StudentsLeavingToday from './StudentsLeavingToday';
import { useTutoring } from '../contexts/TutoringContext';

const TutoringDashboard = () => {
  const navigate = useNavigate();
  const { loading, error} = useTutoring();

  useEffect(() => {
    const teacherId = localStorage.getItem('teacherId');
    if (!teacherId) {
      navigate('/login');
      return;
    }}, [navigate]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Students Leaving for Tutoring Today
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <StudentsLeavingToday />
      <Typography variant="h4" component="h1" gutterBottom>
        Coming For Tutoring
      </Typography>
      <TutoringRequestListSimple />
    </Box>
  );
};

export default TutoringDashboard;
