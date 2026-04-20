import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { ProductCard } from "@/components/ProductCard";
import { ChatWidget } from "@/components/ChatWidget";
import { useShopSettings } from "@/hooks/useShopSettings";
import { Phone, MessageCircle } from "lucide-react";
import heroImage from "@/assets/hero-rice-field.jpg";

export default function Index() {
  const { shopName, tagline, phone, lineId } = useShopSettings();

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_available", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const iceCream = products?.filter((p) => p.category === "ice_cream") ?? [];
  const koji = products?.filter((p) => p.category === "koji") ?? [];

  return (
    <div className="min-h-screen bg-background pb-12">
      <Navbar />

      {/* Hero */}
      <section className="relative h-64 sm:h-80 overflow-hidden">
        <img src={heroImage} alt={shopName} className="w-full h-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 text-center px-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">{shopName}</h1>
          <p className="text-white/90 text-sm mt-2 drop-shadow">{tagline}</p>
        </div>
      </section>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-8">
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {iceCream.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              🍦 ข้าวไอติม
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {iceCream.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {koji.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              🌾 เชื้อโคจิ
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {koji.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {!isLoading && products?.length === 0 && (
          <p className="text-center py-12 text-muted-foreground">ยังไม่มีสินค้าวางจำหน่าย</p>
        )}

        {/* Contact */}
        {(phone || lineId) && (
          <section className="bg-card rounded-2xl border border-border p-5">
            <h2 className="text-base font-bold text-foreground mb-3">📞 ติดต่อร้าน</h2>
            <div className="space-y-2 text-sm">
              {phone && (
                <a href={`tel:${phone}`} className="flex items-center gap-2 text-foreground hover:text-primary">
                  <Phone className="h-4 w-4" /> {phone}
                </a>
              )}
              {lineId && (
                <div className="flex items-center gap-2 text-foreground">
                  <MessageCircle className="h-4 w-4" /> LINE: {lineId}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <ChatWidget />
    </div>
  );
}
