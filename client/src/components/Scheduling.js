import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab
} from '@mui/material';
import TutoringRequestForm from './TutoringRequestForm';
import BulkTutoring from './BulkTutoring';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`scheduling-tabpanel-${index}`}
      aria-labelledby={`scheduling-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const Scheduling = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Schedule Tutoring Sessions
      </Typography>
      <Typography variant="body1" sx={{
          fontStyle: 'italic',
          fontSize: '0.9rem',
          backgroundColor: 'grey.50',
          p: 1.5,
          borderRadius: 1,
          mb: 2
        }}>
        <strong>Note:</strong> Multiple students uses first come, first serve. For priority overrides, use the individual request form.
      </Typography>
      <Paper elevation={2} sx={{ mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          centered
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Individual Student" />
          <Tab label="Multiple Students" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <TutoringRequestForm />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <BulkTutoring />
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default Scheduling;
