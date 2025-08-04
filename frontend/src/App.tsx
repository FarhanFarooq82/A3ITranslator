
import { RealTimeTranslatorApp } from './components/RealTimeTranslatorApp';
import { AppStateProvider } from './context/AppStateContext';
import './App.css';

function App() {
  return (
    <AppStateProvider>
      <div className="App">
        <RealTimeTranslatorApp />
      </div>
    </AppStateProvider>
  );
}

export default App;