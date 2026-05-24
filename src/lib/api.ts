export interface InventoryItem {
  id: string;
  warehouseId: string;
  warehouseName: string;
  location?: string | null;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
}

export interface ProductWithInventory {
  id: string;
  name: string;
  description?: string | null;
  inventories: InventoryItem[];
}

export interface ReservationDetails {
  id: string;
  inventoryId: string;
  quantity: number;
  status: 'pending' | 'confirmed' | 'released';
  expiresAt: string;
  confirmedAt?: string | null;
  releasedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  inventory: {
    id: string;
    productId: string;
    warehouseId: string;
    totalUnits: number;
    reservedUnits: number;
    product: {
      id: string;
      name: string;
      description?: string | null;
    };
    warehouse: {
      id: string;
      name: string;
      location?: string | null;
    };
  };
}

/**
 * Custom error class to propagate structured backend API errors
 */
export class ApiError extends Error {
  status: number;
  error: string;
  details?: any;

  constructor(status: number, error: string, message: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody.error || 'API Error',
      errorBody.message || 'An unexpected error occurred',
      errorBody.details
    );
  }
  return response.json() as Promise<T>;
}

export const api = {
  /**
   * Fetch all products with warehouse inventories
   */
  async getProducts(): Promise<ProductWithInventory[]> {
    const res = await fetch('/api/products', { cache: 'no-store' });
    return handleResponse<ProductWithInventory[]>(res);
  },

  /**
   * Fetch details of a single reservation
   */
  async getReservation(id: string): Promise<ReservationDetails> {
    const res = await fetch(`/api/reservations/${id}`, { cache: 'no-store' });
    return handleResponse<ReservationDetails>(res);
  },

  /**
   * Request a new atomic inventory reservation
   */
  async createReservation(inventoryId: string, quantity: number): Promise<ReservationDetails> {
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryId, quantity }),
    });
    return handleResponse<ReservationDetails>(res);
  },

  /**
   * Confirm purchase for an active pending reservation
   */
  async confirmReservation(id: string): Promise<ReservationDetails> {
    const res = await fetch(`/api/reservations/${id}/confirm`, {
      method: 'POST',
    });
    return handleResponse<ReservationDetails>(res);
  },

  /**
   * Manually release an active pending reservation
   */
  async releaseReservation(id: string): Promise<ReservationDetails> {
    const res = await fetch(`/api/reservations/${id}/release`, {
      method: 'POST',
    });
    return handleResponse<ReservationDetails>(res);
  },
};
