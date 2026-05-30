"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  ArrowLeft, 
  Search, 
  ShoppingBag, 
  Star, 
  MapPin, 
  Phone, 
  QrCode, 
  X, 
  Plus, 
  Coffee, 
  Utensils, 
  Store, 
  Sparkles, 
  Wifi, 
  Battery, 
  CheckCircle2, 
  Smartphone 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type OcrMenuItem = {
  categoryName: string;
  name: string;
  price: number;
};

type InteractiveStorePreviewProps = {
  name: string;
  presetId: string;
  customBusinessType: string;
  streetAddress: string;
  district: string;
  ward: string;
  province: string;
  selectedAddress: string;
  planCode: string;
  tableCount: number;
  itemName: string;
  itemPrice: string;
  itemCategory: string;
  confirmedMenuItems: OcrMenuItem[];
  slug: string;
  hotline: string;
};

const defaultCategoriesPreset: Record<string, string[]> = {
  cafe: ["Cà phê", "Trà sữa", "Bánh ngọt", "Trà trái cây"],
  tea: ["Trà sữa", "Trà trái cây", "Topping", "Ăn vặt"],
  restaurant: ["Món chính", "Món khai vị", "Lẩu & Nướng", "Đồ uống"],
  food: ["Đồ ăn nhanh", "Combo", "Gà rán", "Ăn vặt"],
  custom: ["Menu chính", "Đặc sản", "Món mới", "Tráng miệng"]
};

const defaultItemsPreset: Record<string, Array<{ name: string; price: number; desc: string }>> = {
  cafe: [
    { name: "Cà phê sữa đá", price: 29000, desc: "Cà phê Robusta Đắk Lắk đậm đà pha sữa đặc thơm béo." },
    { name: "Trà sữa trân châu hoàng kim", price: 45000, desc: "Trà đen đậm vị sữa cùng trân châu dai giòn ngọt dịu." },
    { name: "Croissant bơ Pháp", price: 35000, desc: "Bánh sừng bò ngàn lớp thơm nức hương bơ tự nhiên." }
  ],
  tea: [
    { name: "Trà sữa ô long lài", price: 39000, desc: "Sự kết hợp thơm mát giữa trà ô long lài thượng hạng và sữa." },
    { name: "Trà xanh xoài macchiato", price: 42000, desc: "Lớp kem muối biển sánh mịn trên nền trà xoài tươi mát." }
  ],
  restaurant: [
    { name: "Phở bò Wagyu đặc biệt", price: 85000, desc: "Nước dùng ninh xương 24h kèm thịt bò wagyu thái mỏng mềm tan." },
    { name: "Cơm tấm sườn bì chả", price: 45000, desc: "Sườn nướng mật ong thơm phức, hạt cơm tấm dẻo bùi hạt vừa." }
  ],
  food: [
    { name: "Gà rán sốt cay Hàn Quốc", price: 59000, desc: "Thịt gà giòn tan đượm sốt ớt cay ngọt chuẩn vị Hàn." },
    { name: "Burger bò phô mai kép", price: 69000, desc: "2 lớp bò nướng vỉ cùng phô mai cheddar tan chảy thơm lừng." }
  ],
  custom: [
    { name: "Món ngon đặc sản", price: 55000, desc: "Hương vị gia truyền đặc biệt được bếp trưởng lựa chọn tỉ mỉ." }
  ]
};

export function InteractiveStorePreview({
  name = "",
  presetId = "cafe",
  customBusinessType = "",
  streetAddress = "",
  district = "",
  ward = "",
  province = "",
  selectedAddress = "",
  planCode = "pro",
  tableCount = 10,
  itemName = "",
  itemPrice = "",
  itemCategory = "",
  confirmedMenuItems = [],
  slug = "quan-moi",
  hotline = ""
}: InteractiveStorePreviewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartTotal, setCartTotal] = useState<number>(0);
  const [timeStr, setTimeStr] = useState<string>("09:41");

  // Live system clock for mockup phone
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, "0");
      const mins = String(now.getMinutes()).padStart(2, "0");
      setTimeStr(`${hrs}:${mins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Compute address label
  const addressText = useMemo(() => {
    if (selectedAddress.trim()) return selectedAddress;
    const parts = [streetAddress, district, ward, province].map(s => s.trim()).filter(Boolean);
    return parts.join(", ") || "Địa chỉ chưa cập nhật";
  }, [selectedAddress, streetAddress, district, ward, province]);

  // Derived category list based on dynamic data or preset
  const categories = useMemo(() => {
    if (confirmedMenuItems.length > 0) {
      return Array.from(new Set(confirmedMenuItems.map(item => item.categoryName || "Món khác"))).slice(0, 5);
    }
    const derivedDefault = defaultCategoriesPreset[presetId] ?? defaultCategoriesPreset.cafe;
    if (itemCategory.trim()) {
      return [itemCategory.trim(), ...derivedDefault.filter(c => c !== itemCategory.trim())].slice(0, 4);
    }
    return derivedDefault;
  }, [confirmedMenuItems, presetId, itemCategory]);

  const activeCategory = categories.includes(selectedCategory) ? selectedCategory : categories[0] ?? "";

  // Compile final items list
  const menuItems = useMemo(() => {
    if (confirmedMenuItems.length > 0) {
      return confirmedMenuItems.map((item, index) => ({
        id: `ocr-${index}`,
        name: item.name,
        price: item.price,
        category: item.categoryName || "Khác",
        desc: "Món ăn ngon miệng chế biến tươi mới trong ngày."
      }));
    }

    const defaultItems = defaultItemsPreset[presetId] ?? defaultItemsPreset.cafe;
    const singleCustomItem = itemName.trim()
      ? {
          id: "custom-0",
          name: itemName.trim(),
          price: Number(itemPrice) || 28000,
          category: itemCategory.trim() || categories[0],
          desc: "Đặc sản tự chế của quán được khách hàng ưa chuộng."
        }
      : null;

    if (singleCustomItem) {
      return [
        singleCustomItem,
        ...defaultItems.map((item, idx) => ({
          id: `def-${idx}`,
          name: item.name,
          price: item.price,
          category: categories[0] === itemCategory.trim() ? categories[1] || "Đồ uống" : categories[0],
          desc: item.desc
        }))
      ];
    }

    return defaultItems.map((item, idx) => ({
      id: `def-${idx}`,
      name: item.name,
      price: item.price,
      category: categories[0],
      desc: item.desc
    }));
  }, [confirmedMenuItems, presetId, itemName, itemPrice, itemCategory, categories]);

  const displayedItems = useMemo(() => {
    // Show items belonging to active category
    const filtered = menuItems.filter(item => item.category === activeCategory);
    return filtered.length > 0 ? filtered : menuItems;
  }, [menuItems, activeCategory]);

  const handleAddToCart = (price: number) => {
    setCartCount(prev => prev + 1);
    setCartTotal(prev => prev + price);
  };

  const formatVnd = (value: number) => {
    return `${new Intl.NumberFormat("vi-VN").format(value)}đ`;
  };

  // Determine logo icon
  const LogoIcon = useMemo(() => {
    if (presetId === "cafe" || presetId === "tea") return Coffee;
    if (presetId === "restaurant") return Utensils;
    if (presetId === "food") return Store;
    return Sparkles;
  }, [presetId]);

  return (
    <div className="relative mx-auto flex flex-col items-center justify-center p-1">
      {/* Dynamic floating notification */}
      <div className="absolute -top-6 left-1/2 z-30 -translate-x-1/2 w-max rounded-full border border-[#0F4D3A]/15 bg-white/95 px-3 py-1 text-[10px] font-black tracking-[0.05em] text-[#0F4D3A] shadow-md flex items-center gap-1.5 backdrop-blur-sm animate-bounce">
        <Smartphone className="h-3 w-3 animate-pulse" />
        XEM TRƯỚC GIAO DIỆN KHÁCH ĐẶT MÓN
      </div>

      {/* Main iPhone container mockup */}
      <div className="w-[305px] h-[575px] rounded-[48px] border-[10px] border-[#1e293b] bg-slate-900 shadow-[0_28px_80px_rgba(15,42,31,0.22)] relative overflow-hidden flex flex-col select-none">
        
        {/* Notch / Dynamic Island */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-[22px] bg-[#1e293b] rounded-b-2xl z-40 flex items-center justify-end px-4 gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0d1527] border border-[#2d3a52]" />
          <span className="w-3 h-1 bg-[#0d1527] rounded-full" />
        </div>

        {/* Screen layout */}
        <div className="flex-1 flex flex-col bg-[#f8fafc] text-[#111827] overflow-hidden relative rounded-[38px] pt-[22px]">
          
          {/* iOS Status Bar */}
          <div className="flex justify-between items-center px-6 py-1.5 text-[10px] font-black text-slate-800 z-30 shrink-0">
            <span>{timeStr}</span>
            <div className="flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              <span>5G</span>
              <Battery className="h-3.5 w-3.5 ml-0.5" />
            </div>
          </div>

          {/* Customer view content - Scrollable */}
          <div className="flex-1 flex flex-col overflow-y-auto preview-device-screen pb-16">
            
            {/* Top Store Header Banner */}
            <div className="relative shrink-0">
              <div 
                className={`h-24 w-full bg-gradient-to-r transition-all duration-500 flex items-end justify-between p-3 relative ${
                  planCode === "premium" 
                    ? "from-[#0F4D3A] via-[#1A5F49] to-[#d97706]" 
                    : "from-[#0f3d32] to-[#1e5843]"
                }`}
              >
                {/* Plan Badge inside store */}
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider text-white shadow-sm flex items-center gap-0.5 ${
                    planCode === "premium" ? "bg-amber-500 animate-pulse" : "bg-emerald-600"
                  }`}>
                    <Sparkles className="h-2 w-2" />
                    {planCode === "premium" ? "PREMIUM" : "PRO"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[8px] font-black bg-slate-900/40 backdrop-blur-md text-white">
                    Bàn 01
                  </span>
                </div>
              </div>

              {/* Logo / Badge container */}
              <div className="absolute left-4 bottom-[-18px] h-14 w-14 rounded-2xl border-4 border-white bg-white shadow-md flex items-center justify-center overflow-hidden transition-all duration-300">
                <div className="h-full w-full bg-[#0F4D3A] text-white flex items-center justify-center">
                  <LogoIcon className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Store details info card */}
            <div className="pt-6 px-4 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-black tracking-tight text-[#111827] line-clamp-1 leading-snug">
                    {name.trim() || "Tên Quán Của Bạn"}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 mt-0.5 tracking-wide">
                    {slug ? `logivn.com/r/${slug}` : "logivn.com/r/slug"}
                  </p>
                </div>
              </div>

              {/* Store Ratings/Review bar */}
              <div className="flex items-center gap-2 mt-2 py-1 px-2 rounded-lg bg-emerald-50 border border-[#eef7f2] w-fit text-[9px] font-black text-[#0F4D3A]">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span>5.0 (99+ đánh giá)</span>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Mở cửa
                </span>
              </div>

              {/* Location & Contact row */}
              <div className="mt-2.5 space-y-1 text-[10px] text-[#475467] font-semibold leading-relaxed border-t border-slate-100 pt-2.5">
                <div className="flex gap-1.5 items-start">
                  <MapPin className="h-3 w-3 shrink-0 text-[#0F4D3A] mt-0.5" />
                  <span className="line-clamp-2">{addressText}</span>
                </div>
                {hotline && (
                  <div className="flex gap-1.5 items-center">
                    <Phone className="h-3 w-3 shrink-0 text-[#0F4D3A]" />
                    <span>{hotline}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Categories horizontal list section */}
            <div className="mt-4 border-y border-slate-100 py-2 bg-white sticky top-0 z-20 shrink-0 shadow-sm">
              <div className="flex gap-1.5 overflow-x-auto px-4 scrollbar-none">
                {categories.map((cat, idx) => {
                  const active = activeCategory === cat;
                  return (
                    <button
                      key={cat + idx}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black whitespace-nowrap transition-all ${
                        active 
                          ? "bg-[#0F4D3A] text-white shadow-sm" 
                          : "bg-slate-50 border border-slate-200 text-[#475467] hover:border-[#0F4D3A]/20"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Menu Items list */}
            <div className="px-3 pt-3 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
                Danh sách {activeCategory || "Món ăn"}
              </p>
              
              <AnimatePresence mode="popLayout">
                {displayedItems.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="p-2.5 rounded-xl border border-slate-100 bg-white shadow-sm flex justify-between gap-3 items-center group hover:border-[#0F4D3A]/10 hover:shadow-md transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 line-clamp-1">{item.name}</p>
                      <p className="text-[9px] text-slate-400 font-semibold mt-0.5 line-clamp-2 leading-relaxed">{item.desc}</p>
                      <p className="text-xs font-black text-[#0F4D3A] mt-1">{formatVnd(item.price)}</p>
                    </div>
                    
                    {/* Add to cart action button */}
                    <button
                      type="button"
                      onClick={() => handleAddToCart(item.price)}
                      className="h-7 w-7 rounded-lg bg-[#eef7f2] border border-[#0F4D3A]/15 text-[#0F4D3A] flex items-center justify-center hover:bg-[#0F4D3A] hover:text-white transition-all shadow-sm shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Floating Live QR Trigger button */}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="absolute bottom-[66px] right-3.5 h-11 w-11 rounded-full bg-[#0F4D3A] text-white flex items-center justify-center shadow-lg hover:scale-105 transition-all hover:bg-[#0d3f2f] z-30 group"
            title="Xem thử QR Bàn"
          >
            <QrCode className="h-5 w-5" />
            
            <span className="absolute right-12 bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 transition-all pointer-events-none w-max border border-slate-800">
              Quét QR gọi món thử
            </span>
          </button>

          {/* Sticky Checkout Bar */}
          <div className="absolute bottom-0 inset-x-0 h-14 bg-white border-t border-slate-100 px-4 flex items-center justify-between z-30 shadow-[0_-8px_20px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <span className="h-9 w-9 rounded-xl bg-[#eef7f2] border border-[#0F4D3A]/10 flex items-center justify-center text-[#0F4D3A]">
                  <ShoppingBag className="h-5 w-5" />
                </span>
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#F28C28] text-white text-[9px] font-black h-4 min-w-4 px-1 rounded-full flex items-center justify-center border border-white">
                    {cartCount}
                  </span>
                )}
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400">Tạm tính</p>
                <p className="text-xs font-black text-slate-800">{formatVnd(cartTotal)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (cartCount > 0) {
                  setCartCount(0);
                  setCartTotal(0);
                }
              }}
              className="px-4 py-2 bg-[#0F4D3A] text-white text-[11px] font-black rounded-lg shadow-md hover:bg-[#0d3f2f] transition-all"
            >
              {cartCount > 0 ? "Gọi món" : "Chọn món"}
            </button>
          </div>

          {/* QR Scan Table Modal Mockup Overlay */}
          <AnimatePresence>
            {showQrModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex flex-col justify-end"
                role="dialog"
                aria-modal="true"
              >
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 220 }}
                  className="bg-white rounded-t-[28px] p-5 shadow-2xl flex flex-col items-center"
                >
                  <div className="w-full flex justify-between items-center border-b border-slate-100 pb-3">
                    <span className="text-[10px] font-black text-[#0F4D3A] uppercase tracking-[0.1em] flex items-center gap-1">
                      <QrCode className="h-3.5 w-3.5" /> MÃ QR ĐẶT BÀN MẪU
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowQrModal(false)}
                      className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="my-5 flex flex-col items-center p-4 rounded-2xl border-2 border-dashed border-emerald-100 bg-[#fbfcfb] shadow-inner w-full max-w-[200px]">
                    <div className="bg-[#0F4D3A] text-white text-[9px] font-black px-2 py-0.5 rounded-full mb-3 uppercase tracking-wider">
                      LogiVN QR
                    </div>
                    {/* Simulated SVG QR Code */}
                    <svg className="w-32 h-32 text-slate-800" viewBox="0 0 100 100" fill="currentColor">
                      {/* Quiet zone & outer indicators */}
                      <path d="M0 0h30v10H10v20H0V0zm70 0h30v30h-10V10H70V0zM0 70h10v20h20v10H0V70zm100 0v30H70v-10h20V70h10z" />
                      {/* Inside details QR matrix noise */}
                      <path d="M15 15h10v10H15zm0 50h10v10H15zm50 0h10v10H65zm0-50h10v10H65z" />
                      <rect x="35" y="35" width="30" height="30" rx="3" className="text-[#0F4D3A]" />
                      <path d="M42 42h6v6h-6zm10 0h6v6h-6zm0 10h6v6h-6zm-10 0h6v6h-6z" className="text-white" />
                      {/* Tiny QR modules */}
                      <path d="M35 15h5v5h-5zm0 10h5v5h-5zm10-10h5v5h-5zm10 0h5v5h-5zm-5 10h5v5h-5zm15-10h5v5h-5zm5 10h5v5h-5zM15 35h5v5h-5zm10 0h5v5h-5zm20 15h5v5h-5zm10 0h5v5h-5zm20 10h5v5h-5zm0-10h5v5h-5zm10-20h5v5h-5zm-10 10h5v5h-5zm10 20h5v5h-5zm0 10h5v5h-5z" />
                    </svg>
                    <span className="mt-3 text-xs font-black text-slate-800 tracking-wider">
                      BÀN 01
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest text-center leading-normal">
                      Quét tại bàn để gọi món
                    </span>
                  </div>

                  <p className="text-[10px] text-center text-slate-500 font-semibold leading-relaxed max-w-[240px]">
                    Quán của bạn thiết lập tối đa <strong>{tableCount} bàn</strong>. Mã QR gọi món sẽ tự động sinh riêng cho từng bàn sau khi bạn bấm hoàn thành onboarding.
                  </p>
                  
                  <button
                    type="button"
                    onClick={() => setShowQrModal(false)}
                    className="mt-4 w-full h-10 bg-[#0f4d3a] text-white text-xs font-black rounded-lg flex items-center justify-center gap-1.5 hover:bg-[#0d3f2f] transition-all"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Quay lại xem menu
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
