import { CustomerImport } from "@/components/dashboard/CustomerImport";
import { PageHead } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";

export const metadata = { title: "Import customers" };

export default function Page() {
  return (
    <Guard module="customers" action="create">
      <PageHead real title="Import customers" sub="Bring in contacts from past WhatsApp orders (FR-DATA-008). Duplicates are matched by phone number." />
      <CustomerImport />
    </Guard>
  );
}
