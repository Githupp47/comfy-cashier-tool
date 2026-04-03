import type { Tables } from "@/integrations/supabase/types";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

type Product = Tables<"products">;

export function ProductCard(props: Product) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem(props);
    setAdded(true);
    toast.success(`เพิ่ม ${props.name} ลงตะกร้าแล้ว`);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="group rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="aspect-square overflow-hidden bg-muted">
        {props.image_url ? (
          <img
            src={props.image_url}
            alt={props.name}
            loading="lazy"
            width={800}
            height={800}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-5xl bg-accent/30">
            {props.category === "ice_cream" ? "🍦" : "🍚"}
          </div>
        )}
      </div>
      <div className="p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-foreground text-lg">{props.name}</h3>
          {props.rice_variety && (
            <p className="text-xs text-muted-foreground mt-1">
              {props.category === "ice_cream" ? "🍦 ไอติม" : "🍚 โคจิ"} • {props.rice_variety}
              {props.weight && ` • ${props.weight}`}
            </p>
          )}
        </div>
        {props.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{props.description}</p>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xl font-bold text-primary">฿{props.price}</span>
          <Button
            size="sm"
            onClick={handleAdd}
            className={`rounded-full px-4 transition-all duration-300 ${
              added
                ? "bg-accent text-accent-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {added ? (
              <><Check className="h-4 w-4 mr-1" /> เพิ่มแล้ว</>
            ) : (
              <><Plus className="h-4 w-4 mr-1" /> เพิ่ม</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
