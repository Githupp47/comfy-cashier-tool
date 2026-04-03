import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard } from "@/components/ProductCard";
import { Navbar } from "@/components/Navbar";
import { useShopSettings } from "@/hooks/useShopSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import heroImage from "@/assets/hero-rice-field.jpg";

export default function Index() {
  const { shopName, tagline, logoUrl } = useShopSettings();

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

  const iceCreams = products?.filter((p) => p.category === "ice_cream") ?? [];
  const kojis = products?.filter((p) => p.category === "koji") ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative h-[55vh] min-h-[400px] overflow-hidden">
        <img src={heroImage} alt="ทุ่งข้าวไทย" className="w-full h-full object-cover" />
        <div className="absolute inset-0 hero-overlay flex items-center justify-center">
          <div className="text-center space-y-4 px-4">
            {logoUrl && (
              <img src={logoUrl} alt={shopName} className="h-24 md:h-32 mx-auto rounded-xl shadow-lg object-contain bg-background/20 backdrop-blur-sm p-2" />
            )}
            <div className="inline-block px-4 py-1 rounded-full bg-primary/20 backdrop-blur-sm border border-primary/30 mb-2">
              <span className="text-sm font-medium text-primary-foreground/90">🌾 {tagline}</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground drop-shadow-lg">
              {shopName}
            </h1>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="space-y-2">
              <div className="text-3xl">🍦</div>
              <h3 className="font-semibold text-foreground">ไอติมข้าวแท้</h3>
              <p className="text-sm text-muted-foreground">ทำจากข้าวไทยคุณภาพดี ไม่ใส่สารกันเสีย</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl">🍚</div>
              <h3 className="font-semibold text-foreground">เชื้อโคจิพรีเมียม</h3>
              <p className="text-sm text-muted-foreground">เชื้อโคจิคุณภาพสูง สำหรับทำอาหารหมักเอง</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl">🚗</div>
              <h3 className="font-semibold text-foreground">ส่งถึงหอพัก</h3>
              <p className="text-sm text-muted-foreground">สั่งง่าย ส่งไว แค่แชร์ลิงก์ Google Maps</p>
            </div>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">สินค้าของเรา</h2>
          <p className="text-muted-foreground mt-2">เลือกสินค้าที่ถูกใจแล้วสั่งเลย!</p>
        </div>

        <Tabs defaultValue="all" className="space-y-8">
          <TabsList className="mx-auto w-fit">
            <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
            <TabsTrigger value="ice_cream">🍦 ไอติมข้าว</TabsTrigger>
            <TabsTrigger value="koji">🍚 เชื้อโคจิ</TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-card rounded-xl h-80 animate-pulse border border-border" />
              ))}
            </div>
          ) : (
            <>
              <TabsContent value="all">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {products?.map((p) => <ProductCard key={p.id} {...p} />)}
                </div>
                {(!products || products.length === 0) && (
                  <p className="text-center text-muted-foreground py-12">ยังไม่มีสินค้า</p>
                )}
              </TabsContent>
              <TabsContent value="ice_cream">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {iceCreams.map((p) => <ProductCard key={p.id} {...p} />)}
                </div>
              </TabsContent>
              <TabsContent value="koji">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {kojis.map((p) => <ProductCard key={p.id} {...p} />)}
                </div>
              </TabsContent>
            </>
          )}
        </Tabs>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="container mx-auto px-4 py-10 text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            {logoUrl && <img src={logoUrl} alt={shopName} className="h-10 rounded-md object-contain" />}
            <p className="text-lg font-semibold text-foreground">{shopName}</p>
          </div>
          <p className="text-sm text-muted-foreground">{tagline}</p>
          <p className="text-xs text-muted-foreground">© 2026 All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}
