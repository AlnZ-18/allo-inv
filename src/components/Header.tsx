'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 w-full bg-surface/85 backdrop-blur-md border-b border-border/80 shadow-sm transition-all duration-300">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        
        {/* Branding & Logo */}
        <Link href="/products" className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-gradient-to-tr from-primary to-accent rounded-xl flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform duration-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-5 h-5 text-white animate-pulse"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0-5.571 3-5.571-3m11.142 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-primary leading-none group-hover:text-accent transition duration-300">
              Allo<span className="text-accent">.</span>Inv
            </h1>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest leading-none">
              Reservation Engine
            </p>
          </div>
        </Link>

        {/* Dynamic Navigation */}
        <nav className="flex items-center gap-4">
          <Link
            href="/products"
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              pathname === '/products'
                ? 'bg-primary/5 text-primary'
                : 'text-slate-500 hover:text-primary hover:bg-slate-50'
            }`}
          >
            Inventory Hub
          </Link>
          
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold select-none shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Pessimistic Locking: ON</span>
          </div>
        </nav>

      </div>
    </header>
  );
}
