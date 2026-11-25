import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, ShoppingCart, ArrowLeft, Sparkles, MessageCircle, BadgeCheck } from 'lucide-react';
import { useCart } from '../context/useCart';
import { AiNegotiationChatModal } from '../components/AiNegotiationChatModal';

interface ProductRecord {
  id?: string;
  stockName?: string;
  category?: string;
  currency?: string;
  price?: number;
  city?: string;
  area?: string;
  description?: string;
  images?: string[];
  whatsapp?: string | null;
  seller?: {
    name?: string | null;
    isVerified?: boolean;
  } | null;
  canBargain?: boolean;
}

export const ProductDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToCart } = useCart();
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      setProduct(null);
      try {
        const response = await fetch(`https://tradara-backend.onrender.com/api/items/${id}`, {
          signal: controller.signal,
        });
        
        if (!response.ok) {
           throw new Error("Product not found");
        }
        
        const data = await response.json();
        setProduct({ ...data, id: data.id || data._id });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Error fetching product:", err);
        setError("Product not found");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchProduct();
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (!loading && product && searchParams.get('openAiChat') === 'true') {
      setIsAiModalOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('openAiChat');
      setSearchParams(nextParams, { replace: true });
    }
  }, [loading, product, searchParams, setSearchParams]);

  const handleContactSeller = () => {
    const phone = product?.whatsapp?.replace(/\D/g, '');
    if (!phone) return;
    const normalizedPhone = phone.startsWith('0')
      ? `234${phone.slice(1)}`
      : phone;
    const message = encodeURIComponent(
      `Hello, I saw "${product?.stockName}" on Tradara. Is it still available?`
    );
    window.open(`https://wa.me/${normalizedPhone}?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  const handleAddToCartWithDiscount = (discountedPrice: number) => {
    if (product) {
      addToCart({
        ...product,
        price: discountedPrice,
      });
    }
  };

  if (loading) return <div className="pt-24 text-center font-black">LOADING PRODUCT...</div>;
  if (error || !product) return <div className="pt-24 text-center font-black text-red-500 uppercase tracking-widest">PRODUCT NOT FOUND</div>;

  return (
    <div className="pt-20 sm:pt-24 pb-12 px-4 sm:px-6 max-w-6xl mx-auto">
      <button onClick={() => navigate(-1)} className="min-h-11 flex items-center gap-2 mb-6 font-bold text-slate-500 hover:text-blue-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded-lg">
        <ArrowLeft size={20} /> Back
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden bg-slate-900 aspect-square shadow-2xl border border-white/5">
          <img 
            src={product.images?.[0] || 'https://placehold.co/600x600'} 
            className="w-full h-full object-cover"
            alt={product.stockName}
          />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-blue-600 font-black text-xs uppercase tracking-[0.2em]">{product.category || 'General'}</span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight break-words">{product.stockName}</h1>
          </div>
          
          <div className="text-3xl font-black text-blue-600">
            {product.currency || '₦'}{Number(product.price).toLocaleString()}
          </div>
          
          <div className="flex items-center gap-2 text-slate-500 font-bold uppercase text-sm bg-slate-100 dark:bg-white/5 w-fit px-4 py-2 rounded-xl">
            <MapPin size={18} /> {product.city}{product.area ? ` , ${product.area}` : ''}
          </div>

          <section aria-label="Seller details" className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Seller</p>
                <p className="mt-1 font-black dark:text-white">{product.seller?.name || 'Tradara seller'}</p>
              </div>
              {product.seller?.isVerified && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                  <BadgeCheck size={16} aria-hidden="true" /> Verified
                </span>
              )}
            </div>
            {product.whatsapp && (
              <button
                type="button"
                onClick={handleContactSeller}
                className="mt-4 min-h-11 w-full sm:w-auto px-4 rounded-xl border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold inline-flex items-center justify-center gap-2 hover:bg-emerald-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
              >
                <MessageCircle size={18} aria-hidden="true" /> Contact seller on WhatsApp
              </button>
            )}
          </section>

          {product.canBargain && (
            <p className="text-sm font-bold text-violet-600 dark:text-violet-400">Price is negotiable</p>
          )}

          <div className="space-y-2">
            <h3 className="font-black text-xs uppercase text-slate-400">Description</h3>
            <p className="text-slate-500 leading-relaxed text-lg italic">
              "{product.description}"
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-auto">
            <button 
              onClick={() => setIsAiModalOpen(true)}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-5 rounded-[2rem] font-black flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-xl shadow-purple-600/20 active:scale-95 border border-white/10"
            >
              <Sparkles size={20} className="animate-pulse" /> Ask DIRECTLY About This Product
            </button>

            <button 
              onClick={() => addToCart(product)}
              className="flex-1 bg-blue-600 text-white py-5 rounded-[2rem] font-black flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 active:scale-95"
            >
              <ShoppingCart size={20} /> ADD TO CART
            </button>
          </div>
        </div>
      </div>

      {/* AI Assistant Modal */}
      <AiNegotiationChatModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        product={product}
        onAddToCartWithDiscount={handleAddToCartWithDiscount}
      />
    </div>
  );
};