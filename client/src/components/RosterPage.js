import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import StudentRoster from './StudentRoster';
import TeacherRoster from './TeacherRoster';
import { useAuth } from '../contexts/AuthContext';

const RosterPage = () => {
  const [tab, setTab] = useState(0);
  const { currentUser } = useAuth();

  return (
    <Box>
      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Students" />
        <Tab label="Teachers" />
      </Tabs>
      {tab === 0 && <StudentRoster />}
      {tab === 1 && <TeacherRoster currentUserId={currentUser?.id} />}
    </Box>
  );
};

export default RosterPage;
