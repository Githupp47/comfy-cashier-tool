
-- Allow public to read orders (for tracking by phone)
CREATE POLICY "Anyone can view orders by phone"
ON public.orders
FOR SELECT
TO anon
USING (true);

-- Allow public to read order items (for tracking)
CREATE POLICY "Anyone can view order items"
ON public.order_items
FOR SELECT
TO anon
USING (true);
