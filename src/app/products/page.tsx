'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ProductWithInventory, ApiError } from '@/lib/api';

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductWithInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserveLoadingId, setReserveLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchProductsList();
  }, []);

  const fetchProductsList = async () => {
    try {
      setLoading(true);
      const data = await api.getProducts();
      setProducts(data);
      
      const initialQuantities: Record<string, number> = {};
      data.forEach(p => {
        p.inventories.forEach(inv => {
          initialQuantities[inv.id] = 1;
        });
      });
      setQuantities(initialQuantities);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load products:', err);
      setError(err.message || 'Failed to load products. Please ensure the database is online.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (inventoryId: string, value: number) => {
    setQuantities((prev) => ({
      ...prev,
      [inventoryId]: Math.max(1, value),
    }));
  };

  const handleReserve = async (inventoryId: string) => {
    const qty = quantities[inventoryId] || 1;
    try {
      setError(null);
      setReserveLoadingId(inventoryId);
      const reservation = await api.createReservation(inventoryId, qty);
      router.push(`/reservation/${reservation.id}`);
    } catch (err: any) {
      console.error('Reservation failed:', err);
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError(`Insufficient stock: The warehouse does not have ${qty} units available.`);
        } else if (err.status === 404) {
          setError('Selected inventory item could not be found.');
        } else {
          setError(err.message);
        }
      } else {
        setError('A network or server error occurred. Please try again.');
      }
    } finally {
      setReserveLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header section */}
        <div className="border-b border-slate-800 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Inventory & Reservations
            </h1>
            <p className="text-slate-400 mt-2">
              Select product quantities to secure real-time, concurrency-safe stock allocations.
            </p>
          </div>
          <button 
            onClick={fetchProductsList}
            disabled={loading}
            className="px-4 py-2 text-sm bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded transition disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh Stock'}
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="bg-red-950/60 border border-red-800/80 rounded-lg p-4 flex gap-3 text-red-200 text-sm">
            <span className="font-bold">⚠️ Error:</span>
            <div className="flex-1">{error}</div>
            <button onClick={() => setError(null)} className="hover:text-white font-bold px-2">×</button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(idx => (
              <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 h-56 animate-pulse space-y-4">
                <div className="h-6 bg-slate-800 rounded w-1/3"></div>
                <div className="h-4 bg-slate-800 rounded w-2/3"></div>
                <div className="h-10 bg-slate-800 rounded mt-4"></div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/20 border border-slate-800/50 rounded-2xl">
            <p className="text-slate-400 text-lg">No products found. Please seed the database first.</p>
          </div>
        ) : (
          /* Products Grid */
          <div className="grid grid-cols-1 gap-8">
            {products.map((product) => (
              <div 
                key={product.id} 
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">{product.name}</h2>
                  {product.description && (
                    <p className="text-slate-400 text-sm mt-1">{product.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {product.inventories.map((inv) => {
                    const selectedQty = quantities[inv.id] || 1;
                    const isOutOfStock = inv.availableUnits <= 0;
                    const isPendingReserve = reserveLoadingId === inv.id;

                    return (
                      <div 
                        key={inv.id} 
                        className="bg-slate-950 border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-300">
                              🏠 {inv.warehouseName}
                            </span>
                            {isOutOfStock ? (
                              <span className="px-2 py-0.5 text-xs bg-red-950 border border-red-800 text-red-400 rounded-full font-medium">
                                Out of Stock
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-full font-medium">
                                Active
                              </span>
                            )}
                          </div>

                          {/* Inventory Metrics */}
                          <div className="grid grid-cols-3 gap-2 text-center bg-slate-900/40 p-2 rounded-lg text-xs">
                            <div>
                              <div className="text-slate-500 font-medium">Total</div>
                              <div className="text-slate-200 font-bold mt-0.5">{inv.totalUnits}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 font-medium">Hold</div>
                              <div className="text-slate-200 font-bold mt-0.5">{inv.reservedUnits}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 font-medium">Available</div>
                              <div className="text-white font-black mt-0.5 text-emerald-400">
                                {inv.availableUnits}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Reservation Control Panel */}
                        <div className="pt-2 flex items-center gap-3">
                          <div className="w-20">
                            <input 
                              type="number" 
                              min="1"
                              max={inv.availableUnits || 1}
                              value={selectedQty}
                              disabled={isOutOfStock || isPendingReserve}
                              onChange={(e) => handleQuantityChange(inv.id, parseInt(e.target.value) || 1)}
                              className="w-full bg-slate-900 border border-slate-800 rounded py-1.5 px-2 text-center text-sm font-semibold text-white focus:outline-none focus:border-slate-700 disabled:opacity-50"
                            />
                          </div>
                          
                          <button
                            onClick={() => handleReserve(inv.id)}
                            disabled={isOutOfStock || isPendingReserve}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-1.5 px-3 rounded text-sm transition disabled:opacity-30 disabled:hover:bg-blue-600 flex items-center justify-center gap-2"
                          >
                            {isPendingReserve ? (
                              <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                Securing...
                              </>
                            ) : (
                              'Reserve'
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
