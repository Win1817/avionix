import { createSlice } from '@reduxjs/toolkit';

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState: { kpis: null, sectorMetrics: [], safetyTrends: [], workload: [], trafficFlow: [] },
  reducers: {
    setKpis:          (s, a) => { s.kpis = a.payload; },
    setSectorMetrics: (s, a) => { s.sectorMetrics = a.payload; },
    setSafetyTrends:  (s, a) => { s.safetyTrends = a.payload; },
    setWorkload:      (s, a) => { s.workload = a.payload; },
    setTrafficFlow:   (s, a) => { s.trafficFlow = a.payload; },
  },
});

export const { setKpis, setSectorMetrics, setSafetyTrends, setWorkload, setTrafficFlow } = analyticsSlice.actions;
export default analyticsSlice.reducer;
