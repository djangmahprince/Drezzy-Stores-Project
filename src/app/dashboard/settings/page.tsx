import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { requireStaff } from "@/lib/auth";
import { zones } from "@/lib/data";
import { can } from "@/lib/permissions";

export const metadata = { title: "Settings" };

// People who cannot see delivery zones are sent to the first settings tab their role does have.
async function Landing() {
  const { permissions: p } = await requireStaff();
  if (!can(p, "settings")) {
    if (can(p, "staff")) redirect("/dashboard/settings/staff");
    if (can(p, "audit")) redirect("/dashboard/settings/audit");
  }
  return null;
}

export default function Settings() {
  return (
    <>
      <Suspense fallback={null}>
        <Landing />
      </Suspense>
      <Guard module="settings">
        <p className="mb-3 text-sm text-text2">Fees and times are default starting values until the owner confirms them. Editing zones arrives with the orders sprint.</p>
        <Table
          head={["Region", "Fee", "Estimated days", "Half payment"]}
          rows={zones.map((z) => [z.region, `GHS ${z.fee}`, `${z.days}`, z.accra ? "Allowed" : "Not allowed"])}
        />
      </Guard>
    </>
  );
}
