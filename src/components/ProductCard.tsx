import { Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCart, type Product } from "@/contexts/CartContext";

export function ProductCard({ product }: { product: Product }) {
  const { items, addToCart, updateQuantity } = useCart();
  const inCart = items.find((i) => i.product.id === product.id);

  return (
    <Card className="overflow-hidden border-border bg-card group">
      <div className="aspect-square bg-muted overflow-hidden relative">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-4xl">🍚</div>
        )}
        {!product.is_available && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center backdrop-blur-sm">
            <span className="text-xs font-semibold text-muted-foreground">หมดแล้ว</span>
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div>
          <h3 className="font-semibold text-sm text-foreground line-clamp-1">{product.name}</h3>
          {product.weight && <p className="text-[11px] text-muted-foreground mt-0.5">{product.weight}</p>}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-primary">฿{Number(product.price).toLocaleString()}</p>
          {!inCart ? (
            <Button
              size="icon"
              className="h-8 w-8 rounded-full"
              disabled={!product.is_available}
              onClick={() => addToCart(product)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 bg-primary/10 rounded-full p-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-full hover:bg-primary/20"
                onClick={() => updateQuantity(product.id, inCart.quantity - 1)}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="text-sm font-bold text-primary min-w-4 text-center">{inCart.quantity}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-full hover:bg-primary/20"
                onClick={() => updateQuantity(product.id, inCart.quantity + 1)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
