import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/useCart';
import { Trash2, ShoppingBag, ArrowLeft, ChevronRight, MessageSquare } from 'lucide-react';

export const Cart = () => {
  const { cart, removeFromCart, clearCart } = useCart();
  const navigate = useNavigate();

  const totalsByCurrency = cart.reduce<Record<string, number>>((totals, item) => {
    totals[item.currency] = (totals[item.currency] || 0) + item.price * item.quantity;
    return totals;
  }, {});

  const handleCheckout = () => {
    if (cart.length === 0) return;

    const itemList = cart
      .map((item) => `• ${item.stockName} × ${item.quantity} (${item.currency}${item.price.toLocaleString()} each)`)
      .join('\n');
    const totals = Object.entries(totalsByCurrency)
      .map(([currency, total]) => `${currency}${total.toLocaleString()}`)
      .join(' + ');
    const message = `Hello, I found these items on Tradara and would like to contact their sellers:\n\n${itemList}\n\nCart total: ${totals}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const contactSeller = (item: (typeof cart)[number]) => {
    const digits = item.whatsapp?.replace(/\D/g, '');
    if (!digits) return;
    const phone = digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
    const message = encodeURIComponent(
      `Hello, I'm interested in ${item.stockName} × ${item.quantity} listed on Tradara. Is it still available?`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-6">
        <div className="p-8 bg-blue-50 dark:bg-blue-900/10 rounded-[3rem] text-blue-600 animate-bounce">
          <ShoppingBag size={64} />
        </div>
        <h2 className="text-3xl font-black tracking-tighter dark:text-white uppercase">Your Cart is Empty</h2>
        <p className="text-slate-500 font-medium">Time to find some legendary deals!</p>
        <Link to="/" className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all">
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-10 pb-20 px-4 sm:px-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8 sm:mb-12">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 font-bold hover:text-blue-600 transition-colors">
          <ArrowLeft size={20} /> Back
        </button>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase dark:text-white">Your Cart</h1>
        <button onClick={clearCart} className="min-h-11 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500">
          Clear All
        </button>
      </div>

      <div className="space-y-4">
        {cart.map((item) => (
          <div key={item.id} className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-[2rem] flex items-center gap-4 sm:gap-6 shadow-sm group border-2 border-transparent hover:border-blue-500/20 transition-all">
            <img src={item.image || 'https://placehold.co/400x400?text=No+Image'} alt={item.stockName} className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-2xl sm:rounded-3xl shrink-0" />
            
            <div className="flex-1">
              <h3 className="text-base sm:text-xl font-black dark:text-white break-words">{item.stockName}</h3>
              <p className="text-blue-600 font-black text-lg">
                {item.currency}{Number(item.price).toLocaleString()} <span className="text-xs text-slate-500">× {item.quantity}</span>
              </p>
              {item.whatsapp && (
                <button
                  type="button"
                  onClick={() => contactSeller(item)}
                  className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                >
                  <MessageSquare size={14} aria-hidden="true" /> Contact seller
                </button>
              )}
            </div>

            <button 
              onClick={() => removeFromCart(item.id)}
              aria-label={`Remove ${item.stockName} from cart`}
              className="p-3 sm:p-4 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}
      </div>

      {/* SUMMARY CARD */}
      <div className="mt-8 sm:mt-12 bg-blue-600 rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 text-white shadow-2xl shadow-blue-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12">
            <ShoppingBag size={120} />
        </div>
        
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-2">Cart total by currency</p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-8">
            {Object.entries(totalsByCurrency).map(([currency, total]) => `${currency}${total.toLocaleString()}`).join(' + ')}
          </h2>
          
          <button 
            onClick={handleCheckout}
            className="w-full bg-white text-blue-600 py-6 rounded-[2rem] font-black text-sm tracking-[0.2em] uppercase flex items-center justify-center gap-3 hover:bg-slate-50 transition-all active:scale-95 shadow-lg"
          >
            Prepare seller inquiry <ChevronRight size={18} />
          </button>
          
          <p className="text-center mt-6 text-[9px] font-bold opacity-60 flex items-center justify-center gap-2">
            <MessageSquare size={12} /> Opens a WhatsApp draft; payment is arranged directly with sellers
          </p>
        </div>
      </div>
    </div>
  );
};
