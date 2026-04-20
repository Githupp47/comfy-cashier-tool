import { Link, useLocation } from "react-router-dom";
import { ShoppingCart, Search, Home } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useShopSettings } from "@/hooks/useShopSettings";
import brandLogo from "@/assets/brand-logo.png";

export function Navbar() {
  const { totalItems } = useCart();
  const { logoUrl, shopName } = useShopSettings();
  const location = useLocation();
  const logo = logoUrl || brandLogo;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-2xl">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt={shopName} className="h-9 w-9 rounded-lg object-cover" />
          <div>
            <p className="text-sm font-bold text-foreground leading-none">{shopName}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">HAKKŌ</p>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            to="/"
            className={`p-2.5 rounded-full transition-colors ${
              location.pathname === "/" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Home className="h-5 w-5" />
          </Link>
          <Link
            to="/track"
            className={`p-2.5 rounded-full transition-colors ${
              location.pathname === "/track" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <Search className="h-5 w-5" />
          </Link>
          <Link
            to="/checkout"
            className={`p-2.5 rounded-full relative transition-colors ${
              location.pathname === "/checkout" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <ShoppingCart className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center px-1 font-bold">
                {totalItems}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
