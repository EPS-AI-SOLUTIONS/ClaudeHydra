import { useEffect, useState } from "react";
import Launcher from "./components/Launcher";
import Dashboard from "./components/Dashboard";
import { useTheme } from "./contexts/ThemeContext";

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  useEffect(() => {
    // Loading sequence - 2 seconds (faster)
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Solid B&W Background */}
      <div
        className={`absolute inset-0 transition-colors duration-300 ${
          isLight ? 'bg-[#fafafa]' : 'bg-[#0a0a0a]'
        }`}
        style={{ zIndex: 0 }}
      />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          zIndex: 1,
          backgroundImage: `linear-gradient(${isLight ? '#000' : '#fff'} 1px, transparent 1px),
                           linear-gradient(90deg, ${isLight ? '#000' : '#fff'} 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 w-full h-full">
        {isLoading ? <Launcher /> : <Dashboard />}
      </div>
    </div>
  );
}

export default App;
