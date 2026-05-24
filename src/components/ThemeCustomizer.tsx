'use client';

import { useEffect, useState } from 'react';

interface ThemeColor {
  name: string;
  variable: string;
  value: string;
  purpose: string;
}

interface ThemePreset {
  name: string;
  colors: Record<string, string>;
}

const PRESETS: ThemePreset[] = [
  {
    name: 'Steel & Tangerine (Default)',
    colors: {
      '--background': '#F1F5F9',
      '--foreground': '#1E293B',
      '--primary': '#334155',
      '--accent': '#F97316',
      '--surface': '#FFFFFF',
      '--border': '#E2E8F0',
    },
  },
  {
    name: 'Slate & Amber',
    colors: {
      '--background': '#F8FAFC',
      '--foreground': '#0F172A',
      '--primary': '#1E293B',
      '--accent': '#D97706',
      '--surface': '#FFFFFF',
      '--border': '#E2E8F0',
    },
  },
  {
    name: 'Forest & Coral',
    colors: {
      '--background': '#F4F7F5',
      '--foreground': '#132A17',
      '--primary': '#1A3F22',
      '--accent': '#F43F5E',
      '--surface': '#FFFFFF',
      '--border': '#E2EAE5',
    },
  },
  {
    name: 'Ocean Teal',
    colors: {
      '--background': '#F0FDFA',
      '--foreground': '#115E59',
      '--primary': '#0F766E',
      '--accent': '#06B6D4',
      '--surface': '#FFFFFF',
      '--border': '#CCFBF1',
    },
  },
  {
    name: 'Midnight Cyber',
    colors: {
      '--background': '#0B0F19',
      '--foreground': '#F8FAFC',
      '--primary': '#1E1B4B',
      '--accent': '#A855F7',
      '--surface': '#111827',
      '--border': '#1F2937',
    },
  },
];

export default function ThemeCustomizer() {
  const [isOpen, setIsOpen] = useState(false);
  const [colors, setColors] = useState<ThemeColor[]>([
    { name: 'Primary', variable: '--primary', value: '#334155', purpose: 'Steel Blue - Headers, primary labels & text' },
    { name: 'Accent', variable: '--accent', value: '#F97316', purpose: 'Orange - Action buttons, dynamic highlights' },
    { name: 'Background', variable: '--background', value: '#F1F5F9', purpose: 'Light Gray - App body background backdrop' },
    { name: 'Surface', variable: '--surface', value: '#FFFFFF', purpose: 'White - Card bodies, tables & dialog containers' },
    { name: 'Text', variable: '--foreground', value: '#1E293B', purpose: 'Dark Gray - Body descriptions, labels & inputs' },
    { name: 'Border', variable: '--border', value: '#E2E8F0', purpose: 'Light border color for premium glassmorphism outline' },
  ]);
  
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Initialize theme from LocalStorage or DOM variables
  useEffect(() => {
    // Read from localStorage or DOM properties
    const savedColors = localStorage.getItem('inventory-platform-theme');
    if (savedColors) {
      try {
        const parsed = JSON.parse(savedColors) as Record<string, string>;
        applyTheme(parsed);
      } catch (e) {
        console.error('Failed to load saved theme', e);
      }
    } else {
      // Load current CSS values if exist
      const styles = getComputedStyle(document.documentElement);
      const updated = colors.map(c => {
        const val = styles.getPropertyValue(c.variable).trim();
        return val ? { ...c, value: val } : c;
      });
      setColors(updated);
    }
  }, []);

  const applyTheme = (themeColors: Record<string, string>) => {
    const root = document.documentElement;
    
    // Set variables on document element
    Object.entries(themeColors).forEach(([variable, value]) => {
      root.style.setProperty(variable, value);
    });

    // Add transitions temporarily to prevent jumpy layout, then apply updated state
    root.classList.add('theme-transition');

    setColors(prev => prev.map(c => ({
      ...c,
      value: themeColors[c.variable] || c.value
    })));

    localStorage.setItem('inventory-platform-theme', JSON.stringify(themeColors));
  };

  const handleColorChange = (variable: string, hexValue: string) => {
    // Validate hex
    if (!/^#[0-9A-F]{6}$/i.test(hexValue)) return;
    
    const root = document.documentElement;
    root.style.setProperty(variable, hexValue);
    
    setColors(prev => prev.map(c => c.variable === variable ? { ...c, value: hexValue } : c));
    
    // Save to localStorage
    const currentTheme: Record<string, string> = {};
    colors.forEach(c => {
      currentTheme[c.variable] = c.variable === variable ? hexValue : c.value;
    });
    localStorage.setItem('inventory-platform-theme', JSON.stringify(currentTheme));
  };

  const selectPreset = (preset: ThemePreset) => {
    applyTheme(preset.colors);
  };

  const generateCSSSnippet = () => {
    return `:root {
${colors.map(c => `  ${c.variable}: ${c.value};`).join('\n')}
}`;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generateCSSSnippet());
    setCopiedText('CSS Variables Copied!');
    setTimeout(() => setCopiedText(null), 2500);
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 p-4 bg-accent hover:bg-accent/90 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer group"
        title="Customize Color Scheme"
        id="theme-customizer-toggle"
      >
        <span className="relative flex h-3 w-3 mr-0 ml-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-6 h-6 animate-spin-slow group-hover:rotate-45 transition-transform duration-700"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.01-3.022a9 9 0 0 1 11.205-11.205m-11.205 0A9 9 0 0 0 4.044 11.2c.498.498 1.173.8 1.916.8 1.49 0 2.7-.936 3.022-2.22Z"
          />
        </svg>
      </button>

      {/* Slide-out Sidebar Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[480px] bg-surface/95 backdrop-blur-md border-l border-border/80 shadow-2xl z-40 transform transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-border/60 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-primary flex items-center gap-2">
              🎨 Visual Color Scheme Editor
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Live modify & customize variables in our reservation platform.
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Section 1: Presets */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
              Designer Palette Presets
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {PRESETS.map((preset, index) => {
                const isActive = colors.every(c => preset.colors[c.variable] === c.value);
                return (
                  <button
                    key={index}
                    onClick={() => selectPreset(preset)}
                    className={`w-full text-left p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all ${
                      isActive
                        ? 'border-accent bg-accent/5 ring-1 ring-accent'
                        : 'border-border bg-white/50 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className={`text-sm font-bold ${isActive ? 'text-accent' : 'text-slate-800'}`}>
                      {preset.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {Object.entries(preset.colors)
                        .filter(([k]) => k !== '--border')
                        .map(([variable, val]) => (
                          <span
                            key={variable}
                            className="w-4 h-4 rounded-full border border-slate-200/50 shadow-sm"
                            style={{ backgroundColor: val }}
                            title={`${variable}: ${val}`}
                          />
                        ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Hex Customizer Table */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
              Fine-Tune Active Variable Palette
            </h3>
            
            <div className="space-y-4 bg-slate-50/50 border border-border p-4 rounded-xl">
              {colors.map((color) => (
                <div key={color.variable} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-700">{color.name}</span>
                    <code className="text-slate-400 font-mono text-[10px]">{color.variable}</code>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <div className="relative flex items-center justify-center w-10 h-9 border border-border rounded-lg bg-white overflow-hidden shadow-sm">
                      <input
                        type="color"
                        value={color.value}
                        onChange={(e) => handleColorChange(color.variable, e.target.value)}
                        className="absolute inset-0 w-full h-full p-0 border-0 cursor-pointer opacity-0"
                      />
                      <span
                        className="w-6 h-6 rounded-full border border-slate-200 shadow-inner"
                        style={{ backgroundColor: color.value }}
                      />
                    </div>
                    
                    <input
                      type="text"
                      maxLength={7}
                      value={color.value}
                      onChange={(e) => handleColorChange(color.variable, e.target.value)}
                      className="flex-1 bg-white border border-border rounded-lg py-1.5 px-3 text-sm font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
                    />
                  </div>
                  
                  <p className="text-[11px] text-slate-500 font-medium leading-normal pl-0.5 mt-0.5">
                    {color.purpose}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Visual Spec Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-primary uppercase tracking-wider">
              Color Token Specifications Table
            </h3>
            <div className="overflow-hidden border border-border rounded-xl bg-white shadow-sm">
              <table className="min-w-full divide-y divide-border text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Role</th>
                    <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Hex Code</th>
                    <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Sample</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {colors.map((color) => (
                    <tr key={color.variable} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <div className="text-xs font-extrabold text-slate-800">{color.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{color.variable}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{color.value}</td>
                      <td className="px-4 py-3">
                        <div
                          className="w-12 h-6 rounded border border-slate-200/50 shadow-inner"
                          style={{ backgroundColor: color.value }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Drawer Footer / Export Snippet */}
        <div className="p-6 border-t border-border/80 bg-slate-50 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleCopyCode}
              className="flex-1 bg-primary hover:bg-primary/95 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition shadow flex items-center justify-center gap-2 cursor-pointer"
            >
              {copiedText ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {copiedText}
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0A2.25 2.25 0 0 1 13.5 4.5h-3a2.25 2.25 0 0 1-2.166-1.612m7.332 0c.055.194.084.4.084.612v1.5c0 .621-.504 1.125-1.125 1.125h-9C5.124 6.25 4.62 5.746 4.62 5.125V3.612c0-.211.029-.418.084-.612m7.332 0c.346-.102.637-.272.847-.497a.75.75 0 0 0-.585-1.27H9.75a.75.75 0 0 0-.585 1.27c.21.225.501.395.847.497m5.104 8.854-4.218 4.219a1.946 1.946 0 0 1-2.75 0L5.3 14.305m11.562-4.446v7.5A2.25 2.25 0 0 1 14.62 19.62H9.38a2.25 2.25 0 0 1-2.25-2.25v-7.5" />
                  </svg>
                  Export CSS Config
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
