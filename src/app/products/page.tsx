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

  // Calculate dynamic dashboard stats
  const totalWarehouses = new Set(
    products.flatMap(p => p.inventories.map(inv => inv.warehouseId))
  ).size;

  const totalUnits = products.reduce(
    (sum, p) => sum + p.inventories.reduce((isum, inv) => isum + inv.totalUnits, 0),
    0
  );

  const reservedUnits = products.reduce(
    (sum, p) => sum + p.inventories.reduce((isum, inv) => isum + inv.reservedUnits, 0),
    0
  );

  const availableUnits = products.reduce(
    (sum, p) => sum + p.inventories.reduce((isum, inv) => isum + inv.availableUnits, 0),
    0
  );

  const utilizationRate = totalUnits > 0 ? Math.round((reservedUnits / totalUnits) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header section with Dynamic Stats Dashboard */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-primary">
              Warehouse Inventory Hub
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Select product quantities to secure real-time, concurrency-safe stock allocations.
            </p>
          </div>
          <button 
            onClick={fetchProductsList}
            disabled={loading}
            className="self-start md:self-auto px-5 py-2.5 text-sm bg-primary hover:bg-primary/95 text-white font-bold rounded-xl transition shadow hover:shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Syncing...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Sync Stock Hub
              </>
            )}
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-red-800 text-sm shadow-sm animate-bounce">
            <span className="font-bold">⚠️ Connection Issue:</span>
            <div className="flex-1 font-semibold">{error}</div>
            <button onClick={() => setError(null)} className="hover:text-red-950 font-bold px-2 text-base">×</button>
          </div>
        )}

        {/* Statistics Widgets Grid */}
        {!loading && products.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Widget 1 */}
            <div className="bg-surface border border-border p-5 rounded-2xl shadow-sm hover:shadow-md transition space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Total Capacity</span>
                <span className="text-xl">📦</span>
              </div>
              <div>
                <div className="text-2xl font-black text-primary">{totalUnits}</div>
                <div className="text-[10px] font-medium text-slate-500 mt-0.5">Aggregated units across all nodes</div>
              </div>
            </div>

            {/* Widget 2 */}
            <div className="bg-surface border border-border p-5 rounded-2xl shadow-sm hover:shadow-md transition space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Active Holds</span>
                <span className="text-xl">⏳</span>
              </div>
              <div>
                <div className="text-2xl font-black text-accent">{reservedUnits}</div>
                <div className="text-[10px] font-medium text-slate-500 mt-0.5">Temporarily locked in checkout</div>
              </div>
            </div>

            {/* Widget 3 */}
            <div className="bg-surface border border-border p-5 rounded-2xl shadow-sm hover:shadow-md transition space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Available Units</span>
                <span className="text-xl">✨</span>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-600">{availableUnits}</div>
                <div className="text-[10px] font-medium text-slate-500 mt-0.5">Ready for instant reservation</div>
              </div>
            </div>

            {/* Widget 4 */}
            <div className="bg-surface border border-border p-5 rounded-2xl shadow-sm hover:shadow-md transition space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Stock Lock Rate</span>
                <span className="text-xl">🔒</span>
              </div>
              <div>
                <div className="text-2xl font-black text-primary">{utilizationRate}%</div>
                <div className="text-[10px] font-medium text-slate-500 mt-0.5">Ratio of secured inventory</div>
              </div>
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(idx => (
              <div key={idx} className="bg-surface border border-border rounded-2xl p-6 h-60 animate-pulse space-y-4 shadow-sm">
                <div className="h-6 bg-slate-200/60 rounded w-1/3"></div>
                <div className="h-4 bg-slate-200/60 rounded w-2/3"></div>
                <div className="h-20 bg-slate-200/60 rounded-xl mt-4"></div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 bg-surface border border-border rounded-2xl shadow-sm space-y-3">
            <span className="text-4xl block">🔍</span>
            <p className="text-slate-500 font-bold text-lg">No products found. Please seed the database first.</p>
          </div>
        ) : (
          /* Products Grid */
          <div className="grid grid-cols-1 gap-8">
            {products.map((product) => (
              <div 
                key={product.id} 
                className="bg-surface border border-border rounded-2xl p-6 md:p-8 space-y-6 shadow-sm hover:shadow-md transition duration-300"
              >
                {/* Product Title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg md:text-xl font-bold text-primary">{product.name}</h3>
                    {product.description && (
                      <p className="text-slate-500 text-sm mt-1">{product.description}</p>
                    )}
                  </div>
                  <span className="self-start sm:self-auto px-3 py-1 bg-primary/5 text-primary text-xs font-bold rounded-full border border-primary/10">
                    Warehouses Active: {product.inventories.length}
                  </span>
                </div>

                {/* Warehouse Sub-grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {product.inventories.map((inv) => {
                    const selectedQty = quantities[inv.id] || 1;
                    const isOutOfStock = inv.availableUnits <= 0;
                    const isPendingReserve = reserveLoadingId === inv.id;
                    const percentReserved = inv.totalUnits > 0 ? Math.round((inv.reservedUnits / inv.totalUnits) * 100) : 0;

                    return (
                      <div 
                        key={inv.id} 
                        className="bg-slate-50/50 border border-border hover:border-slate-300 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition shadow-sm hover:shadow-md"
                      >
                        <div className="space-y-4">
                          {/* Warehouse Title Header */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                              🏠 {inv.warehouseName}
                            </span>
                            {isOutOfStock ? (
                              <span className="px-2.5 py-1 text-[10px] bg-red-100 border border-red-200/80 text-red-700 rounded-full font-bold uppercase tracking-wider leading-none">
                                Sold Out
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 text-[10px] bg-emerald-100 border border-emerald-200/80 text-emerald-700 rounded-full font-bold uppercase tracking-wider leading-none">
                                In Stock
                              </span>
                            )}
                          </div>

                          {/* Inventory Metrics */}
                          <div className="grid grid-cols-3 gap-2 text-center bg-white border border-border p-2.5 rounded-xl text-[11px] shadow-sm font-semibold text-slate-700">
                            <div>
                              <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total</div>
                              <div className="text-slate-800 text-xs font-extrabold mt-0.5">{inv.totalUnits}</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Hold</div>
                              <div className="text-slate-800 text-xs font-extrabold mt-0.5">{inv.reservedUnits}</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Avail</div>
                              <div className={`text-xs font-black mt-0.5 ${isOutOfStock ? 'text-red-600' : 'text-emerald-600'}`}>
                                {inv.availableUnits}
                              </div>
                            </div>
                          </div>

                          {/* Styled Progress Bar representing lock percentage */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <span>Allocation Held</span>
                              <span className={percentReserved > 0 ? 'text-accent' : 'text-slate-400'}>{percentReserved}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-200/60 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-accent transition-all duration-500" 
                                style={{ width: `${percentReserved}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Reservation Control Panel */}
                        <div className="pt-3 flex items-center gap-3 border-t border-slate-100">
                          <div className="w-20">
                            <input 
                              type="number" 
                              min="1"
                              max={inv.availableUnits || 1}
                              value={selectedQty}
                              disabled={isOutOfStock || isPendingReserve}
                              onChange={(e) => handleQuantityChange(inv.id, parseInt(e.target.value) || 1)}
                              className="w-full bg-white border border-border hover:border-slate-300 rounded-xl py-2 px-3 text-center text-sm font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent disabled:opacity-50 transition"
                            />
                          </div>
                          
                          <button
                            onClick={() => handleReserve(inv.id)}
                            disabled={isOutOfStock || isPendingReserve}
                            className="flex-1 bg-accent hover:bg-accent/90 text-white font-bold py-2 px-4 rounded-xl text-sm transition shadow hover:shadow-md disabled:opacity-30 disabled:hover:bg-accent flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {isPendingReserve ? (
                              <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                Securing...
                              </>
                            ) : (
                              <>
                                <span>Reserve</span>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                                </svg>
                              </>
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
