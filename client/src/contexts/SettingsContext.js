import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import apiService from '../utils/apiService';

// The school's settings (labels, priority days, no-tutoring days...), loaded
// from GET /api/settings once a teacher is signed in. Until they arrive -
// and if the request fails - the app shows these defaults, which match the
// server's defaults in server/utils/schoolSettings.js.
export const DEFAULT_SETTINGS = {
  schoolName: '',
  homeroomLabel: 'Raptor Rotation',
  homeroomShortLabel: 'RR',
  priorityByWeekday: { 1: 'CS', 2: 'Math', 4: 'Humanities', 5: 'Science' },
  noTutoringWeekdays: [0, 3, 6],
  schoolYearStart: { month: 8, day: 1 },
  calendarEventPrefix: 'RR Tutoring'
};

const SettingsContext = createContext({ settings: DEFAULT_SETTINGS, refreshSettings: async () => {} });

export const SettingsProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await apiService.getSettings();
      setSettings({ ...DEFAULT_SETTINGS, ...res.data });
    } catch (err) {
      console.error('Failed to load school settings', apiService.formatError(err));
    }
  }, []);

  useEffect(() => {
    if (currentUser) refreshSettings();
  }, [currentUser, refreshSettings]);

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
