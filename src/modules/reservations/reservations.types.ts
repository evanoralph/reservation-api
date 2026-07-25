export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export interface ReservationRow {
  id: string;
  item_id: string;
  customer_id: string;
  quantity: number;
  status: ReservationStatus;
  expires_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationResponse {
  id: string;
  item_id: string;
  customer_id: string;
  quantity: number;
  status: ReservationStatus;
  created_at: string;
  expires_at: string;
}

export interface CreateReservationInput {
  item_id: string;
  customer_id: string;
  quantity: number;
}
