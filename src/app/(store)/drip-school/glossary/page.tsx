import Link from "next/link";
import { getGlossary } from "@/lib/site/server";

export const metadata = { title: "Sneaker glossary", description: "OG, retro, colourway, GS sizing and more, explained for newcomers." };

/** The glossary (FR-JR-012), linked from guides. */
export default async function Glossary() {
  const terms = await getGlossary();
  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-text2"><Link href="/drip-school" className="hover:text-navy">Drip School</Link> › <span className="text-ink">Glossary</span></nav>
      <h1 className="text-[28px] font-bold md:text-[40px]">Sneaker and style glossary</h1>
      <p className="mt-2 text-text2">The words you will see in our guides and on product pages, in plain English.</p>
      <dl className="mt-8 divide-y divide-line">
        {terms.map((t) => (
          <div key={t.slug} id={t.slug} className="scroll-mt-32 py-4">
            <dt className="text-lg font-bold">{t.term}</dt>
            <dd className="mt-1 text-text2">{t.definition}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
