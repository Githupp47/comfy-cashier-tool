import type { Tables } from "@/integrations/supabase/types";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";

type Product = Tables<"products">;

export function ProductCard(props: Product) {
  const { addItem } = useCart();

  const handleAdd = () => {
    addItem(props);
    toast.success(`เพิ่ม ${props.name} ลงตะกร้าแล้ว`);
  };

  return (
    <div className="group rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="aspect-square overflow-hidden bg-muted">
        {props.image_url ? (
          <img
            src={props.image_url}
            alt={props.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-4xl">
            {props.category === "ice_cream" ? "🍦" : "🍚"}
          </div>
        )}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-foreground">{props.name}</h3>
        {props.rice_variety && (
          <p className="text-xs text-muted-foreground">
            {props.category === "ice_cream" ? "🍦" : "🍚"} {props.category === "ice_cream" ? "ไอติม" : "โคจิ"} • {props.rice_variety}
            {props.weight && ` • ${props.weight}`}
          </p>
        )}
        {props.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{props.description}</p>
        )}
        <div className="flex items-center justify-between pt-2">
          <span className="text-lg font-bold text-primary">฿{props.price}</span>
          <Button size="sm" onClick={handleAdd} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> เพิ่ม
          </Button>
        </div>
      </div>
    </div>
  );
}
