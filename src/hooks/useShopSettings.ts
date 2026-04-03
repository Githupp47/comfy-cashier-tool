import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useShopSettings() {
  const { data: settings } = useQuery({
    queryKey: ["shop-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shop_settings").select("*");
      if (error) throw error;
      const map: Record<string, string> = {};
      (data as { key: string; value: string | null }[]).forEach((s) => {
        map[s.key] = s.value ?? "";
      });
      return map;
    },
    staleTime: 1000 * 60 * 5,
  });

  return {
    shopName: settings?.shop_name || "ข้าวไอติม & เชื้อโคจิ",
    tagline: settings?.shop_tagline || "จากทุ่งนาสู่ของอร่อย",
    logoUrl: settings?.logo_url || "",
    phone: settings?.shop_phone || "",
    lineId: settings?.shop_line_id || "",
  };
}
