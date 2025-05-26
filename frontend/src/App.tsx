
import RealTimeTranslatorApp from './components/RealTimeTranslatorApp';
import { TranslationProvider } from './context/TranslationContext';
import './App.css';

function App() {
  return (
    <TranslationProvider>
      <div className="App">
        <RealTimeTranslatorApp />
      </div>
    </TranslationProvider>
  );
}

export default App;