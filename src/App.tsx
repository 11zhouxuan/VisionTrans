import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import OverlayPage from './pages/overlay/OverlayPage';
import ResultPage from './pages/result/ResultPage';
import SettingsPage from './pages/settings/SettingsPage';
import OnboardingPage from './pages/onboarding/OnboardingPage';

function App() {
  const [windowLabel, setWindowLabel] = useState<string>('');

  useEffect(() => {
    const label = getCurrentWindow().label;
    setWindowLabel(label);
  }, []);

  switch (windowLabel) {
    case 'overlay':
      return <OverlayPage />;
    case 'result':
      return <ResultPage />;
    case 'settings':
      return <SettingsPage />;
    case 'onboarding':
      return <OnboardingPage />;
    default:
      // main window - no UI rendered
      return null;
  }
}

export default App;
