import { CatalogueProvider } from "@/components/CatalogueProvider";
import { CartDrawer } from "@/components/store/CartDrawer";
import { BottomNav, StoreFooter, StoreHeader, WhatsAppButton } from "@/components/store/StoreShell";
import { getCatalogue } from "@/lib/catalogue/server";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const products = await getCatalogue();
  return (
    <CatalogueProvider products={products}>
      <StoreHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 md:px-8">{children}</main>
      <StoreFooter />
      <WhatsAppButton />
      <BottomNav />
      <CartDrawer />
    </CatalogueProvider>
  );
}
