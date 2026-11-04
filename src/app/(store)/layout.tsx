import { CatalogueProvider } from "@/components/CatalogueProvider";
import { CartDrawer } from "@/components/store/CartDrawer";
import { SiteChrome } from "@/components/store/SiteChrome";
import { BottomNav, StoreFooter, StoreHeader, WhatsAppButton } from "@/components/store/StoreShell";
import { getCatalogue } from "@/lib/catalogue/server";
import { getSiteContent } from "@/lib/site/server";
import { getZones } from "@/lib/zones";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [products, zones, site] = await Promise.all([getCatalogue(), getZones(), getSiteContent()]);
  return (
    <CatalogueProvider products={products} zones={zones} site={site.settings}>
      <StoreHeader announcements={site.announcements} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 md:px-8">{children}</main>
      <StoreFooter settings={site.settings} />
      <WhatsAppButton />
      <BottomNav />
      <CartDrawer />
      <SiteChrome />
    </CatalogueProvider>
  );
}
