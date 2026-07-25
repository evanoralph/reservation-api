export interface ItemRow {
  id: string;
  name: string;
  total_quantity: number;
  confirmed_quantity: number;
  created_at: string;
  updated_at: string;
}

/**
 * Inventory status returned by GET /v1/items/:id and POST /v1/items.
 *
 * available_quantity =
 *   total_quantity - confirmed_quantity - held_quantity
 *
 * held_quantity only includes PENDING reservations that have not expired.
 */
export interface ItemStatus {
  id: string;
  name: string;
  total_quantity: number;
  available_quantity: number;
  held_quantity: number;
  confirmed_quantity: number;
}

export interface CreateItemInput {
  name: string;
  initial_quantity: number;
}
