import { Suspense } from "react";
import { PageHead } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { LogisticsDesk } from "@/components/dashboard/LogisticsDesk";
import type { LogisticsData } from "@/lib/logistics/staff";
import { getLogistics } from "@/lib/logistics/staff";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Logistics" };

/** Design preview only: invented riders and deliveries. */
const sample: LogisticsData = {
  deliveredToday: 4,
  line: { accra: "054 899 6648", kumasi: "055 355 7347", hours: "Monday to Saturday, 8am to 8pm" },
  jobs: [
    { id: "a", number: "DRZ-1027", status: "out_for_delivery", customer: "Ama", customerPhone: "024 000 0001", place: "Adum, Kumasi", rider: "Yaw", riderPhone: "020 000 0002", courier: null, tracking: null, balance: 0, update: "On the way to you", updateAt: "2026-11-05T10:20:00Z", due: null },
    { id: "b", number: "DRZ-1028", status: "dispatched", customer: "Adwoa", customerPhone: "024 000 0003", place: "Osu, Accra", rider: "Kofi", riderPhone: "020 000 0004", courier: null, tracking: null, balance: 200, update: null, updateAt: null, due: null },
    { id: "c", number: "DRZ-1026", status: "dispatched", customer: "Kwabena", customerPhone: "024 000 0005", place: "Sunyani", rider: null, riderPhone: null, courier: "Skynet", tracking: "SK12345", balance: 0, update: null, updateAt: null, due: null },
    { id: "d", number: "DRZ-1032", status: "packed", customer: "Akua", customerPhone: "024 000 0006", place: "Spintex, Accra", rider: null, riderPhone: null, courier: null, tracking: null, balance: 90, update: null, updateAt: null, due: null },
  ],
  riders: [
    { id: "1", name: "Kofi", kind: "rider", company: null, phone: "020 000 0004", region: "Greater Accra", active: 1, deliveredWeek: 21, hasLogin: true },
    { id: "2", name: "Yaw", kind: "rider", company: null, phone: "020 000 0002", region: "Ashanti", active: 1, deliveredWeek: 18, hasLogin: true },
  ],
};

async function Live() {
  return <LogisticsDesk d={await getLogistics()} />;
}

export default function Logistics() {
  return (
    <Guard module="orders">
      <PageHead real={isSupabaseConfigured} title="Logistics" sub="Who has each parcel and how to reach them. We don't use GPS, so riders and this desk keep customers informed." />
      {isSupabaseConfigured ? <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}><Live /></Suspense> : <LogisticsDesk d={sample} demo />}
    </Guard>
  );
}
