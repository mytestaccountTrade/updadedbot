import React from 'react';
import { Dashboard } from './components/Dashboard';
import { LanguageProvider } from './contexts/LanguageContext';

function App() {
  return (
    <LanguageProvider>
      <div className="App">
        <Dashboard />
      </div>
    </LanguageProvider>
  );
}

export default App;