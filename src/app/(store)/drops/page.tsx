import { DropCalendar } from "@/components/store/DropCalendar";

export const metadata = { title: "Drop calendar", description: "Limited sneaker drops at Drezzy Stores: release dates, countdowns and Notify me." };

export default function Drops() {
  return (
    <div>
      <p className="label-wide text-text2">Limited drops</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">Drop calendar</h1>
      <p className="mt-2 max-w-xl text-text2">New and limited releases, with a cap per customer so more people get a pair. Press Notify me and we will email you when a drop opens.</p>
      <DropCalendar />
    </div>
  );
}
