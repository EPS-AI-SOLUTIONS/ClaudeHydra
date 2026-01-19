import { useEffect, useState } from "react";
import Launcher from "./components/Launcher";
import Dashboard from "./components/Dashboard";
import WitcherRain from "./components/WitcherRain";
import { useTheme } from "./contexts/ThemeContext";

// Background images from public folder
const backgroundDark = "/background.webp";
const backgroundLight = "/backgroundlight.webp";

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
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500"
        style={{
          zIndex: 0,
          backgroundImage: `url(${isLight ? backgroundLight : backgroundDark})`,
        }}
      />
      
      {/* Dark overlay for better readability */}
      <div
        className={`absolute inset-0 transition-colors duration-300 ${
          isLight 
            ? 'bg-white/30' 
            : 'bg-black/40'
        }`}
        style={{ zIndex: 1 }}
      />

      {/* WitcherRain effect */}
      <WitcherRain />

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          background: isLight
            ? 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.1) 100%)'
            : 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',
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
