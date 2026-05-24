'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ReservationDetails, ApiError } from '@/lib/api';

export default function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  
  const { id } = use(params);

  const [reservation, setReservation] = useState<ReservationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    fetchReservationDetails();
  }, [id]);

  useEffect(() => {
    if (!reservation || reservation.status !== 'pending') return;

    const calculateTimeLeft = () => {
      const difference = +new Date(reservation.expiresAt) - +new Date();
      if (difference <= 0) {
        setTimeLeft(0);
        setIsExpired(true);
        return;
      }
      setTimeLeft(Math.floor(difference / 1000));
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [reservation]);

  const fetchReservationDetails = async () => {
    try {
      setLoading(true);
      const data = await api.getReservation(id);
      setReservation(data);
      
      const difference = +new Date(data.expiresAt) - +new Date();
      if (difference <= 0 && data.status === 'pending') {
        setIsExpired(true);
      } else {
        setIsExpired(false);
      }
      
      setError(null);
    } catch (err: any) {
      console.error('Failed to load reservation:', err);
      setError(err.message || 'Failed to fetch reservation details.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!reservation) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await api.confirmReservation(reservation.id);
      setReservation(updated);
    } catch (err: any) {
      console.error('Confirmation failed:', err);
      if (err instanceof ApiError) {
        if (err.status === 410) {
          setError('This reservation has already expired and cannot be confirmed.');
          setIsExpired(true);
        } else {
          setError(err.message);
        }
      } else {
        setError('A network or server error occurred. Please try again.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;
    try {
      setActionLoading(true);
      setError(null);
      const updated = await api.releaseReservation(reservation.id);
      setReservation(updated);
    } catch (err: any) {
      console.error('Cancellation failed:', err);
      setError(err.message || 'Failed to release reservation.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <span className="w-10 h-10 border-4 border-slate-200 border-t-accent rounded-full animate-spin inline-block"></span>
          <p className="text-slate-500 text-sm">Fetching reservation details...</p>
        </div>
      </div>
    );
  }

  if (error && !reservation) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface border border-slate-200 rounded-2xl p-6 text-center space-y-6 shadow-md">
          <div className="w-12 h-12 bg-red-100 border border-red-200 text-red-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            ⚠️
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-primary">Failed to Load Reservation</h2>
            <p className="text-slate-500 text-sm">{error}</p>
          </div>
          <button 
            onClick={() => router.push('/products')}
            className="w-full bg-primary hover:bg-primary/95 text-white py-2 px-4 rounded text-sm font-semibold transition shadow-sm cursor-pointer"
          >
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  if (!reservation) {
    return null;
  }

  const { product, warehouse } = reservation.inventory;
  const isPending = reservation.status === 'pending' && !isExpired;
  const isConfirmed = reservation.status === 'confirmed';
  const isReleased = reservation.status === 'released' || (reservation.status === 'pending' && isExpired);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12 flex items-center justify-center">
      <div className="max-w-xl w-full space-y-6">
        
        {/* Navigation shortcut */}
        <button 
          onClick={() => router.push('/products')}
          className="text-sm font-bold text-slate-500 hover:text-primary transition flex items-center gap-1.5 cursor-pointer group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Product Inventory
        </button>

        {/* Card Board */}
        <div className="bg-surface border border-border rounded-3xl shadow-xl overflow-hidden hover:shadow-2xl transition duration-300">
          
          {/* Header Banner */}
          <div className="bg-slate-50/50 p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Reservation ID: <code className="text-xs text-primary font-mono bg-primary/5 px-2 py-0.5 rounded border border-primary/10">{reservation.id.slice(0, 8)}...</code>
            </span>
            
            {/* Status Badges */}
            {isConfirmed && (
              <span className="self-start sm:self-auto px-3 py-1 text-[11px] bg-emerald-100 border border-emerald-200/80 text-emerald-700 rounded-full font-bold uppercase tracking-wider leading-none">
                ✓ Confirmed
              </span>
            )}
            {isReleased && (
              <span className="self-start sm:self-auto px-3 py-1 text-[11px] bg-red-100 border border-red-200/80 text-red-700 rounded-full font-bold uppercase tracking-wider leading-none">
                ✕ Released / Expired
              </span>
            )}
            {isPending && (
              <span className="self-start sm:self-auto px-3 py-1 text-[11px] bg-amber-50 border border-amber-200/80 text-amber-700 rounded-full font-bold uppercase tracking-wider leading-none animate-pulse">
                ⏳ Holding Stock
              </span>
            )}
          </div>

          <div className="p-6 md:p-8 space-y-6">
            
            {/* Countdown timer for active states */}
            {isPending && (
              <div className={`text-center py-6 border rounded-2xl space-y-2 shadow-sm transition duration-300 ${
                timeLeft < 60 
                  ? 'bg-red-50 border-red-200 animate-pulse' 
                  : 'bg-slate-100/50 border-border'
              }`}>
                <div className={`text-4xl md:text-5xl font-mono font-black tracking-widest ${
                  timeLeft < 60 ? 'text-red-600' : 'text-primary'
                }`}>
                  {formatTime(timeLeft)}
                </div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Hold Period Remaining
                </p>
                <p className="text-[10px] text-slate-400 font-medium px-4">
                  Checkout must be finalized before this clock expires, or stock will release.
                </p>
              </div>
            )}

            {/* Error notifications */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800 text-xs flex gap-3 shadow-sm font-semibold">
                <span className="text-sm">⚠️</span>
                <div className="flex-1 leading-relaxed">{error}</div>
              </div>
            )}

            {/* Expiry Banner */}
            {isReleased && (reservation.status === 'pending' || isExpired) && (
              <div className="bg-red-50 border border-red-200/80 rounded-2xl p-6 text-center space-y-2 shadow-sm">
                <div className="text-xl font-black text-red-700 flex items-center justify-center gap-1.5">
                  <span>🔒</span> Hold Period Expired
                </div>
                <p className="text-slate-500 text-xs font-semibold leading-relaxed">
                  This reservation window closed. The allocated units have been safely returned to the active stock pool.
                </p>
              </div>
            )}

            {/* Product description list */}
            <div className="space-y-4 bg-slate-50/50 border border-border p-5 rounded-2xl">
              <div className="flex justify-between border-b border-slate-200 pb-3 text-xs md:text-sm">
                <span className="text-slate-500 font-bold flex items-center gap-1.5">📦 Product</span>
                <span className="text-primary font-black">{product.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-3 text-xs md:text-sm">
                <span className="text-slate-500 font-bold flex items-center gap-1.5">🏠 Warehouse Node</span>
                <span className="text-slate-800 font-black">{warehouse.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-3 text-xs md:text-sm">
                <span className="text-slate-500 font-bold flex items-center gap-1.5">🔢 Quantity Locked</span>
                <span className="text-accent font-black text-base">{reservation.quantity} Units</span>
              </div>
              <div className="flex justify-between pb-1 text-xs md:text-sm">
                <span className="text-slate-500 font-bold flex items-center gap-1.5">⚙️ Lifecycle Status</span>
                <span className="text-slate-800 font-black capitalize">{reservation.status}</span>
              </div>
            </div>

            {/* Actions button group */}
            {isPending && (
              <div className="pt-4 grid grid-cols-2 gap-4 border-t border-slate-100">
                <button
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="bg-white hover:bg-slate-100 border border-border text-slate-700 font-bold py-2.5 px-4 rounded-xl transition disabled:opacity-50 text-xs md:text-sm cursor-pointer shadow-sm hover:shadow active:scale-98"
                >
                  Cancel Hold
                </button>
                
                <button
                  onClick={handleConfirm}
                  disabled={actionLoading}
                  className="bg-accent hover:bg-accent/90 text-white font-bold py-2.5 px-4 rounded-xl transition disabled:opacity-50 text-xs md:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg active:scale-98"
                >
                  {actionLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      Locking...
                    </>
                  ) : (
                    <>
                      <span>Confirm Order</span>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Success state completion */}
            {isConfirmed && (
              <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-6 text-center space-y-2 shadow-sm">
                <div className="text-xl font-black text-emerald-700 flex items-center justify-center gap-1.5">
                  <span>✓</span> Purchase Secured
                </div>
                <p className="text-slate-500 text-xs font-semibold leading-relaxed">
                  Locking finalized! {reservation.quantity} items have been permanently deducted from warehouse stock.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
