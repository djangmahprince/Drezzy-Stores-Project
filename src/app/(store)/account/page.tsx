import { AccountView } from "@/components/store/AccountView";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "My Drezzy" };

export default function Account() {
  return <AccountView live={isSupabaseConfigured} />;
}
