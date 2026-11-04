import { PrivacyRequestForm } from "@/components/store/PrivacyRequestForm";

export const metadata = { title: "Your data", description: "See, correct or delete the personal data Drezzy Stores holds about you." };

/** The data rights page (PRD section 21, Data Protection Act 2012, Act 843), for guests and account holders. */
export default function PrivacyRequests() {
  return (
    <div className="mx-auto max-w-xl">
      <p className="label-wide text-text2">Privacy</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">Your data</h1>
      <p className="mt-2 text-text2">You can ask to see what we hold about you, to correct it, to delete it, or to stop marketing messages. We answer within 30 days. If you have an account, you can download your data at once from My Drezzy.</p>
      <PrivacyRequestForm />
    </div>
  );
}
