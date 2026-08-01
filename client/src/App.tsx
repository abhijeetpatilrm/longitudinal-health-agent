
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout.tsx';
import DailyLogScreen from './screens/DailyLogScreen.tsx';
import AnalyticsScreen from './screens/AnalyticsScreen.tsx';
import RetrospectiveScreen from './screens/RetrospectiveScreen.tsx';
import AuditScreen from './screens/AuditScreen.tsx';



function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DailyLogScreen />} />
          <Route path="analytics" element={<AnalyticsScreen />} />
          <Route path="retrospective" element={<RetrospectiveScreen />} />
          <Route path="audit" element={<AuditScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
