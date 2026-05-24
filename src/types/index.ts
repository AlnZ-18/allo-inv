export type ReservationStatus = 'pending' | 'confirmed' | 'released';

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Warehouse {
  id: string;
  name: string;
  location?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Inventory {
  id: string;
  productId: string;
  warehouseId: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reservation {
  id: string;
  inventoryId: string;
  units: number;
  status: ReservationStatus;
  expiresAt: Date;
  confirmedAt?: Date | null;
  releasedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
