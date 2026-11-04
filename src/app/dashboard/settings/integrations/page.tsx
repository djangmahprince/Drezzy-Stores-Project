import { Pill, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { paymentOptions } from "@/lib/payments/config";
import { channelsReady } from "@/lib/notify/send";

export const metadata = { title: "Integrations and data" };

const on = (b: boolean) => <Pill tone={b ? "ok" : "warn"}>{b ? "On" : "Not set up"}</Pill>;

/** What is connected, and the data dictionary (FR-DATA-011): each kind of record, what it holds and who can see it. */
export default function Integrations() {
  const pay = paymentOptions();
  const ch = channelsReady();
  const rows: [string, string, boolean][] = [
    ["Paystack", "MoMo prompts and cards (PAYSTACK_SECRET_KEY); webhook at /api/payments/paystack/webhook", pay.paystack],
    ["Manual MoMo", "Fallback while Paystack is not live (DREZZY_MOMO_NUMBER)", !!pay.manual],
    ["Email", "Order updates and reports through Resend (RESEND_API_KEY, NOTIFY_FROM)", ch.includes("email")],
    ["SMS", "Order updates by SMS through Hubtel (HUBTEL_CLIENT_ID, HUBTEL_CLIENT_SECRET, SMS_FROM)", ch.includes("sms")],
    ["WhatsApp Business", "Automated order updates with an approved template (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE)", ch.includes("whatsapp")],
    ["Scheduled jobs", "Alerts, reminders and report emails every 15 minutes (CRON_SECRET)", !!process.env.CRON_SECRET],
    ["Google sign-in", "For shoppers (NEXT_PUBLIC_GOOGLE_AUTH=1, plus the Google provider in Supabase Auth)", process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1"],
    ["Phone codes", "Shopper sign-in by SMS code (NEXT_PUBLIC_PHONE_OTP=1, plus an SMS provider in Supabase Auth)", process.env.NEXT_PUBLIC_PHONE_OTP === "1"],
    ["Google Analytics 4", "Loaded only after the visitor allows analytics (NEXT_PUBLIC_GA4_ID)", !!process.env.NEXT_PUBLIC_GA4_ID],
    ["Meta, TikTok and Snap pixels", "Loaded only after consent (NEXT_PUBLIC_META_PIXEL_ID, NEXT_PUBLIC_TIKTOK_PIXEL_ID, NEXT_PUBLIC_SNAP_PIXEL_ID)", !!(process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || process.env.NEXT_PUBLIC_SNAP_PIXEL_ID)],
    ["Courier APIs", "Waiting for the courier you choose first (PRD section 22). Any courier and tracking number can be recorded today", false],
  ];
  const dictionary: [string, string, string][] = [
    ["Customers", "Name, phone, email, region, how they found us, tags, notes, consent, birthday", "Owner, Admin, Support (all); Sales (own); Dispatch (delivery fields); Finance (view)"],
    ["Shopper accounts", "Profile, sizes, style, addresses, wishlist, points, referral code", "The shopper; Support, Admin, Owner"],
    ["Orders and payments", "Items, prices, delivery, payment plan, payments, balance, timeline, notes", "By role; Sales see their own"],
    ["Supplier costs", "What each supplier charges, agreed cost per supplier order", "Owner, Admin, Finance, Sourcing only"],
    ["Money", "Ledger, expenses with receipts, other money in, budgets, month closes, rider cash", "Owner, Finance; Admin views; Sourcing and Dispatch their own categories"],
    ["Salary records", "Pay, allowances, deductions, payslips", "Owner and Finance only; excluded from general exports"],
    ["Staff", "Name, role, branch, start date, status, targets, reports. No attendance or shifts", "Owner, Admin; each person sees their own targets"],
    ["Content", "Articles, pages, banners, looks, collections, media, reviews", "Content Editor, Admin, Owner"],
    ["Analytics events", "Anonymous visit steps with a random session id; no names, phones or emails", "Read through reports only"],
    ["Audit log", "Who changed what, with old and new values. Cannot be edited", "Owner, Admin, Finance"],
    ["Export log", "Who exported what, with row count, format and filters", "Owner, Admin, Finance"],
  ];
  return (
    <Guard module="settings">
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 font-semibold">Integrations</h2>
          <Table head={["Service", "What it does", "Status"]} rows={rows.map(([a, b, c]) => [a, b, on(c)])} />
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Data dictionary</h2>
          <Table head={["Record", "What it holds", "Who can see it"]} rows={dictionary} />
        </section>
        <section className="card space-y-2 p-4 text-sm text-text2">
          <h2 className="font-semibold text-ink">Backups and safety (FR-DATA-009)</h2>
          <p>Supabase takes daily backups on paid plans and keeps them for 7 to 30 days depending on the plan. Turn on Point-in-Time Recovery for 30 days, and test a restore into a spare project every quarter. Steps are in the README.</p>
        </section>
      </div>
    </Guard>
  );
}
