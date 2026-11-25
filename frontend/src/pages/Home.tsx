import { useState, useEffect, useMemo, lazy, Suspense, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Search, Loader2, Rocket, Package, TrendingUp, Globe2, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { Footer } from '../components/footer';

const ItemCard = lazy(() => import('./../components/ItemCard').then(module => ({ default: module.ItemCard })));

interface HomeItem {
  id: string;
  city?: string;
  area?: string;
  stockName?: string;
}

export const Home = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<HomeItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useState({ city: '', area: '' });
  const category = 'All';

  const fetchItems = useCallback(async () => {
    try {
      const params: Record<string, string | undefined> = {
        search: searchTerm || undefined,
        city: location.city || undefined,
        area: location.area || undefined,
        category: category !== 'All' ? category : undefined,
      };
      const { data } = await api.get('/items', { params });
      setItems(data as HomeItem[]);
    } catch (error) {
      console.error('Fetch failed', error);
    }
  }, [category, location.area, location.city, searchTerm]);

  useEffect(() => {
    const delay = setTimeout(fetchItems, 400);
    return () => clearTimeout(delay);
  }, [fetchItems]);

  const filteredItems = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return items.filter((item: HomeItem) => {
      const city = (item.city || '').toLowerCase();
      const area = (item.area || '').toLowerCase();
      const name = (item.stockName || '').toLowerCase();
      return name.includes(query) || city.includes(query) || area.includes(query);
    });
  }, [items, searchTerm]);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors">
      
      {/* HERO SECTION */}
      <section className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px] gap-8 lg:gap-10 items-center pt-8 sm:pt-10 lg:pt-12 pb-8 lg:pb-10">
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="min-w-0 space-y-5 sm:space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/10 border border-blue-500/30 text-blue-500 text-xs font-black tracking-widest uppercase">
            <Rocket size={14} className="animate-bounce" /> The Future of Commerce
          </div>
          <h1 className="text-[clamp(2.75rem,12vw,4.5rem)] md:text-7xl xl:text-8xl font-black tracking-tighter leading-[0.92] dark:text-white break-words">
            BECOME <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-400">LEGENDARY</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-400 font-medium max-w-xl leading-relaxed">
            Turn your business into a global brand. The marketplace where unknown names become global icons.
          </p>
          
          <Link to="/register" className="w-full sm:w-auto min-h-14 justify-center inline-flex px-5 sm:px-8 py-4 sm:py-5 bg-gradient-to-r from-blue-600 to-violet-600 rounded-2xl font-black text-sm sm:text-lg hover:scale-[1.02] transition-all text-white shadow-xl shadow-blue-500/20 items-center gap-3">
            <Globe2 size={24} /> START SELLING WORLDWIDE
          </Link>
        </motion.div>

        {/* HERO VISUAL */}
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative hidden lg:flex justify-center">
          <div className="absolute inset-0 bg-blue-600/20 blur-[120px] rounded-full animate-pulse" />
          <div className="glass-card w-[280px] h-[560px] rounded-[3rem] border-4 border-slate-200 dark:border-white/10 overflow-hidden relative z-10 p-2 bg-white dark:bg-slate-900">
             <div className="bg-black w-full h-full rounded-[2.5rem] overflow-hidden flex flex-col items-center justify-center">
                <Globe className="text-blue-500 animate-spin-slow mb-4" size={48} />
                <div className="px-4 text-center">
                   <div className="h-2 w-20 bg-slate-800 rounded mx-auto mb-2" />
                   <div className="h-2 w-12 bg-slate-800 rounded mx-auto" />
                </div>
             </div>
          </div>
        </motion.div>
      </section>

      {/* SOCIAL PROOF STRIP */}
      <div className="border-y border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 backdrop-blur-md py-6 sm:py-8">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 flex flex-wrap justify-around gap-6 sm:gap-8">
          <div className="flex flex-col items-center"><Globe2 className="text-blue-500 mb-1" size={24}/><span className="text-2xl font-black dark:text-white">190+</span><span className="text-[8px] text-slate-500 uppercase font-black">Countries</span></div>
          <div className="flex flex-col items-center"><Package className="text-cyan-500 mb-1" size={24}/><span className="text-2xl font-black dark:text-white">50K+</span><span className="text-[8px] text-slate-500 uppercase font-black">Listings</span></div>
          <div className="flex flex-col items-center"><TrendingUp className="text-violet-500 mb-1" size={24}/><span className="text-2xl font-black dark:text-white">24/7</span><span className="text-[8px] text-slate-500 uppercase font-black">Growth</span></div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 mt-8 relative z-30 mb-12 sm:mb-16">
        <div className="glass-card p-4 md:p-6 rounded-[2rem] flex flex-col gap-4 items-center border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl">
          <div className="flex items-center gap-3 px-4 w-full border-b md:border-b-0 md:border-r border-slate-100 dark:border-white/5 pb-2 md:pb-0">
            <Search className="text-blue-600 shrink-0" size={22} />
            <input 
              className="bg-transparent border-none outline-none w-full text-lg placeholder:text-slate-400 dark:text-white font-bold" 
              placeholder="Search items..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          <div className="grid grid-cols-2 md:flex gap-2 w-full md:w-auto">
            <input 
              placeholder="CITY" 
              className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-2 py-3 text-[10px] dark:text-white font-black uppercase text-center" 
              onChange={(e) => setLocation({...location, city: e.target.value})} 
            />
            <input 
              placeholder="AREA" 
              className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-2 py-3 text-[10px] dark:text-white font-black uppercase text-center" 
              onChange={(e) => setLocation({...location, area: e.target.value})} 
            />
            <button 
              onClick={fetchItems} 
              className="col-span-2 md:w-auto bg-blue-600 px-8 py-3 rounded-xl font-black text-white text-xs uppercase"
            >
              Search
            </button>
          </div>
        </div>
      </div>
      
      {/* 4-COLUMN GRID */}
      <div className="max-w-7xl mx-auto px-2 pb-32">
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={48} /></div>}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
            {filteredItems.map((item: HomeItem) => (
              <div key={item.id} className="cursor-pointer transition-transform hover:scale-[1.02]" onClick={() => navigate(`/product/${item.id}`)}>
                 <ItemCard item={item} />
              </div>
            ))}
          </div>
        </Suspense>
      </div>
      <Footer />
    </div>
  );
};