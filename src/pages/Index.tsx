import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard } from "@/components/ProductCard";
import { Navbar } from "@/components/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Index() {
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
      <section className="relative h-[50vh] min-h-[360px] overflow-hidden bg-accent">
        <div className="hero-overlay absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/40">
          <div className="text-center space-y-3 px-4">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground">
              🍦 ข้าวไอติม & เชื้อโคจิ
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto">
              จากข้าวไทยหลากหลายพันธุ์ สู่ไอติมข้าวรสชาติเฉพาะตัว และเชื้อโคจิคุณภาพ
            </p>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="container mx-auto px-4 py-12">
        <Tabs defaultValue="all" className="space-y-8">
          <TabsList className="mx-auto w-fit">
            <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
            <TabsTrigger value="ice_cream">🍦 ไอติมข้าว</TabsTrigger>
            <TabsTrigger value="koji">🍚 เชื้อโคจิ</TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-card rounded-lg h-80 animate-pulse" />
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
        <div className="container mx-auto px-4 py-8 text-center text-muted-foreground text-sm">
          <p>© 2026 ข้าวไอติม & เชื้อโคจิ — จากทุ่งนาสู่ของอร่อย</p>
        </div>
      </footer>
    </div>
  );
}
