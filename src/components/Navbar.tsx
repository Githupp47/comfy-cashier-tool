import { ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useShopSettings } from "@/hooks/useShopSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { itemCount } = useCart();
  const { shopName, logoUrl } = useShopSettings();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/90 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5 text-lg font-bold text-foreground hover:text-primary transition-colors">
          {logoUrl ? (
            <img src={logoUrl} alt={shopName} className="h-9 w-auto rounded-md object-contain" />
          ) : (
            <span className="text-2xl">🌾</span>
          )}
          <span className="hidden sm:inline">{shopName}</span>
        </Link>
        <Link to="/checkout">
          <Button variant="outline" size="sm" className="relative rounded-full gap-2 border-primary/30 hover:bg-primary/10">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">ตะกร้า</span>
            {itemCount > 0 && (
              <Badge className="h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground">
                {itemCount}
              </Badge>
            )}
          </Button>
        </Link>
      </div>
    </nav>
  );
}
