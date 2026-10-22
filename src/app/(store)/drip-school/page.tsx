import { DripBrowser } from "@/components/store/DripBrowser";

export const metadata = { title: "Drip School" };

export default function DripSchool() {
  return (
    <div>
      <p className="label-wide text-text2">Drip School</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">Learn how to dress. Find what to wear.</h1>
      <DripBrowser />
    </div>
  );
}
