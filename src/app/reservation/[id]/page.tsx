'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ReservationDetails, ApiError } from '@/lib/api';

export default function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  
  // Await the Next.js 16 dynamic parameter promise using React.use
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

  // Expiry Countdown logic
  useEffect(() => {
    if (!reservation || reservation.status !== 'pending') return;

    const calculateTimeLeft = () => {
      const difference = +new Date(reservation.expiresAt) - +new Date();
      if (difference <= 0) {
        setTimeLeft(0);
        setIsExpired(true);
        // Force the reservation to be released/expired locally
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
      
      // Compute if already expired
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <span className="w-10 h-10 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin inline-block"></span>
          <p className="text-slate-400 text-sm">Fetching reservation details...</p>
        </div>
      </div>
    );
  }

  if (error && !reservation) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-6">
          <div className="w-12 h-12 bg-red-950 border border-red-800 text-red-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            ⚠️
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-white">Failed to Load Reservation</h2>
            <p className="text-slate-400 text-sm">{error}</p>
          </div>
          <button 
            onClick={() => router.push('/products')}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 px-4 rounded text-sm transition"
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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 flex items-center justify-center">
      <div className="max-w-xl w-full space-y-6">
        
        {/* Navigation shortcut */}
        <button 
          onClick={() => router.push('/products')}
          className="text-sm text-slate-400 hover:text-white transition flex items-center gap-1"
        >
          ← Back to Product Inventory
        </button>

        {/* Card Board */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          
          {/* Header Banner */}
          <div className="bg-slate-950 p-6 border-b border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-400">
              Reservation ID: <code className="text-xs text-slate-200">{reservation.id.slice(0, 8)}...</code>
            </span>
            
            {/* Status Badges */}
            {isConfirmed && (
              <span className="px-3 py-1 text-xs bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-full font-bold">
                ✓ Confirmed
              </span>
            )}
            {isReleased && (
              <span className="px-3 py-1 text-xs bg-red-950 border border-red-800 text-red-400 rounded-full font-bold">
                ✕ Released / Expired
              </span>
            )}
            {isPending && (
              <span className="px-3 py-1 text-xs bg-blue-950 border border-blue-800 text-blue-400 rounded-full font-bold animate-pulse">
                ⏳ Holding Stock
              </span>
            )}
          </div>

          <div className="p-6 md:p-8 space-y-6">
            
            {/* Countdown timer for active states */}
            {isPending && (
              <div className="text-center py-6 bg-slate-950 border border-slate-800/80 rounded-xl space-y-2">
                <div className="text-4xl font-mono font-black text-white tracking-widest">
                  {formatTime(timeLeft)}
                </div>
                <p className="text-xs text-slate-400">
                  Hold time remaining. Purchase must be completed before expiry.
                </p>
              </div>
            )}

            {/* Error notifications */}
            {error && (
              <div className="bg-red-950/60 border border-red-800/80 rounded-lg p-3 text-red-200 text-xs flex gap-2">
                <span>⚠️</span>
                <div className="flex-1">{error}</div>
              </div>
            )}

            {/* Expiry Banner */}
            {isReleased && (reservation.status === 'pending' || isExpired) && (
              <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-5 text-center space-y-2">
                <div className="text-2xl font-bold text-red-400">Hold Expired</div>
                <p className="text-slate-400 text-xs">
                  This reservation reservation has expired and the allocated items have been returned to the available stock pool.
                </p>
              </div>
            )}

            {/* Product description list */}
            <div className="space-y-4">
              <div className="flex justify-between border-b border-slate-800 pb-3 text-sm">
                <span className="text-slate-500 font-medium">Product</span>
                <span className="text-white font-bold">{product.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-3 text-sm">
                <span className="text-slate-500 font-medium">Warehouse</span>
                <span className="text-slate-300 font-bold">🏠 {warehouse.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-3 text-sm">
                <span className="text-slate-500 font-medium">Quantity Requested</span>
                <span className="text-white font-extrabold">{reservation.quantity} Units</span>
              </div>
              <div className="flex justify-between pb-1 text-sm">
                <span className="text-slate-500 font-medium">Lifecycle Status</span>
                <span className="text-slate-300 font-bold capitalize">{reservation.status}</span>
              </div>
            </div>

            {/* Actions button group */}
            {isPending && (
              <div className="pt-4 grid grid-cols-2 gap-4">
                <button
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold py-2 px-4 rounded transition disabled:opacity-50 text-sm"
                >
                  Cancel Hold
                </button>
                
                <button
                  onClick={handleConfirm}
                  disabled={actionLoading}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      Completing...
                    </>
                  ) : (
                    'Confirm Purchase'
                  )}
                </button>
              </div>
            )}

            {/* Success state completion */}
            {isConfirmed && (
              <div className="bg-emerald-950/30 border border-emerald-900/60 rounded-xl p-5 text-center space-y-2">
                <div className="text-xl font-bold text-emerald-400">Order Finalized</div>
                <p className="text-slate-400 text-xs">
                  Thank you! Your purchase is successfully locked. {reservation.quantity} items have been permanently deducted from stock.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
