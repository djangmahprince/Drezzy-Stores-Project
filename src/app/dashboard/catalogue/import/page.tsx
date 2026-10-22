import { PageHead } from "@/components/dashboard/DashShell";
import { DbGate, Guard } from "@/components/dashboard/Guard";
import { ImportWizard } from "@/components/dashboard/ImportWizard";

export const metadata = { title: "Import products" };

export default function ImportPage() {
  return (
    <Guard module="products" action="create">
      <PageHead real title="Import from Excel" sub="Bring your existing product list in, with sizes, prices and supplier costs" />
      <DbGate>
        <ImportWizard />
      </DbGate>
    </Guard>
  );
}
