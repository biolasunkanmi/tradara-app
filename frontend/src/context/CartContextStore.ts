import { createContext } from 'react';

export interface CartItem {
  id: string;
  stockName: string;
  price: number;
  currency: string;
  image: string;
  whatsapp?: string;
  quantity: number;
}

export interface CartProduct {
  id?: string;
  _id?: string;
  stockName?: string;
  price?: number;
  currency?: string;
  images?: string[];
  whatsapp?: string;
}

export interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartProduct) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
}

export const CartContext = createContext<CartContextType | undefined>(undefined);
