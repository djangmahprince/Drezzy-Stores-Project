"use client";

import { useEffect, useState } from "react";
import { orderFeedbackAction, reviewAction, supportPostAction, supportThreadsAction, type Thread } from "@/app/(store)/actions";
import type { TrackView } from "@/lib/orders/track";
import { track } from "@/lib/track";

type Msg = { text: string; bad?: boolean } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role={m.bad ? "alert" : "status"} className={`mt-2 rounded-[12px] px-3 py-2 text-sm ${m.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{m.text}</p> : null);

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`} onClick={() => onChange(n)}
          className={`size-11 rounded-full text-xl ${n <= value ? "bg-lime text-navy" : "bg-card text-text2"}`}>★</button>
      ))}
    </div>
  );
}

function ReviewForm({ number, phone, item, onDone }: { number: string; phone: string; item: { name: string; slug: string }; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(true);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form className="mt-3 space-y-2 rounded-[12px] bg-card p-3" onSubmit={async (e) => {
      e.preventDefault();
      if (!rating) return setMsg({ text: "Choose a rating.", bad: true });
      const r = await reviewAction({ number, phone, product: item.slug, rating, title, body, displayName: name, consent });
      setMsg(r.ok ? { text: "Thank you. Your review shows once our team has checked it." } : { text: r.error, bad: true });
      if (r.ok) onDone();
    }}>
      <p className="font-medium">{item.name}</p>
      <Stars value={rating} onChange={setRating} label={`Rating for ${item.name}`} />
      <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Headline (optional)" aria-label="Headline" />
      <textarea className="field py-2" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1500} placeholder="How does it fit and feel?" aria-label="Your review" />
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name to show (first name is fine)" aria-label="Name to show" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="size-5 accent-[#00115b]" /> Drezzy may publish this review on the shop</label>
      <button className="btn-primary !min-h-10">Send review</button>
      <Note m={msg} />
    </form>
  );
}

/**
 * The parts of the tracker that need the shop to be connected: the delivery code (FR-ORD-011), the delivery rating,
 * reviews from verified buyers (FR-SF-013), messages linked to the order (FR-DB-009) and the invoice (FR-ACC-006).
 */
export function TrackExtras({ view, phone }: { view: TrackView; phone: string }) {
  const [rating, setRating] = useState(view.feedback ?? 0);
  const [comment, setComment] = useState("");
  const [fbMsg, setFbMsg] = useState<Msg>(null);
  const [reviewing, setReviewing] = useState<string | null>(() => (typeof window !== "undefined" && window.location.hash === "#review" ? view.toReview[0]?.slug ?? null : null));
  const [done, setDone] = useState<string[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  const load = () => supportThreadsAction(view.number, phone).then((r) => r.ok && setThreads(r.data ?? []));
  useEffect(() => {
    track("order_status_view", { order: view.number, step: view.stepNumber });
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.number]);

  async function send() {
    if (!body.trim()) return;
    const r = await supportPostAction({ number: view.number, phone, thread: threads[0]?.id, body });
    setMsg(r.ok ? { text: "Sent. We usually reply within an hour in opening hours." } : { text: r.error, bad: true });
    if (r.ok) {
      setBody("");
      void load();
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {view.deliveryCode && !view.delivered && (
        <section className="rounded-[16px] bg-navy p-5 text-white">
          <p className="label-wide text-lime">Your delivery code</p>
          <p className="mt-2 text-4xl font-extrabold tracking-[0.3em]">{view.deliveryCode}</p>
          <p className="mt-2 text-sm text-white/80">Give this code to the rider only when your order is in your hands.</p>
        </section>
      )}

      <a href={`/api/invoice?number=${encodeURIComponent(view.number)}&phone=${encodeURIComponent(phone)}`} className="btn-outline w-full">Download invoice (PDF)</a>

      {view.delivered && (
        <section className="card p-5" id="review">
          <h3 className="font-semibold">How did we do?</h3>
          {view.feedback && !fbMsg ? <p className="mt-1 text-sm text-text2">You rated this delivery {view.feedback} of 5. Thank you.</p> : (
            <form className="mt-2 space-y-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!rating) return setFbMsg({ text: "Choose a rating.", bad: true });
              const r = await orderFeedbackAction(view.number, phone, rating, comment);
              setFbMsg(r.ok ? { text: "Thank you for the feedback." } : { text: r.error, bad: true });
            }}>
              <Stars value={rating} onChange={setRating} label="Rate your delivery" />
              <input className="field" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Anything we should know? (optional)" aria-label="Comment" />
              <button className="btn-primary !min-h-10">Send</button>
              <Note m={fbMsg} />
            </form>
          )}
          {view.toReview.filter((i) => !done.includes(i.slug)).length > 0 && (
            <div className="mt-5">
              <h3 className="font-semibold">Review what you bought</h3>
              {view.toReview.filter((i) => !done.includes(i.slug)).map((i) => (
                <div key={i.slug} className="mt-2">
                  {reviewing === i.slug
                    ? <ReviewForm number={view.number} phone={phone} item={i} onDone={() => setDone((d) => [...d, i.slug])} />
                    : <button type="button" className="btn-outline !min-h-10" onClick={() => setReviewing(i.slug)}>Review {i.name}</button>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card p-5">
        <h3 className="font-semibold">Message us about this order</h3>
        {threads.flatMap((t) => t.messages).length > 0 && (
          <ul className="mt-3 space-y-2">
            {threads.flatMap((t) => t.messages).map((m, i) => (
              <li key={i} className={`max-w-[85%] rounded-[12px] px-3 py-2 text-sm ${m.from_staff ? "bg-navy text-white" : "ml-auto bg-card"}`}>
                <p>{m.body}</p><p className={`mt-1 text-[11px] ${m.from_staff ? "text-white/70" : "text-text2"}`}>{m.from_staff ? `${m.name}, Drezzy` : "You"}</p>
              </li>
            ))}
          </ul>
        )}
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input className="field" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Write a message" aria-label="Message" />
          <button className="btn-primary">Send</button>
        </form>
        <Note m={msg} />
      </section>
    </div>
  );
}
