import { Guard } from "@/components/dashboard/Guard";
import { PageHead, Pill, Table } from "@/components/dashboard/DashShell";

export const metadata = { title: "Customers" };

export default function Customers() {
  return (
    <Guard module="customers">
      <PageHead title="Customers" sub="One record per customer, whatever channel they used" actions={<button className="btn-outline">Export</button>} />
      <Table
        head={["Name", "Phone", "Region", "Source", "Orders", "Lifetime value", "Tags"]}
        rows={[
          ["Ama Mensah", "+233 24 000 0000", "Ashanti", "Instagram", "3", "GHS 1,250", <Pill key="1" tone="info">VIP</Pill>],
          ["Esi Boateng", "+233 20 000 0001", "Greater Accra", "TikTok", "1", "GHS 400", ""],
          ["Kojo Asare", "+233 27 000 0002", "Western", "Friend or relative", "2", "GHS 850", ""],
          ["Selorm Dzah", "+233 50 000 0003", "Northern", "WhatsApp", "1", "GHS 600", <Pill key="2" tone="info">Wholesale</Pill>],
        ]}
      />
    </Guard>
  );
}
