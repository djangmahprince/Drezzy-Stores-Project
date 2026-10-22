// Static content that is not the product catalogue: articles, tracker copy, branches and delivery zones.
// The catalogue itself lives in src/lib/catalogue (database when Supabase is connected, sample data otherwise).
// Delivery fees and times are DEFAULTS until the owner confirms them (PRD section 27).
import type { ArtKind, Tone } from "@/lib/catalogue/types";

export const formatGHS = (n: number) => `GHS ${n.toLocaleString("en-GH")}`;

export const articles = [
  { slug: "5-ways-to-wear-nike-dunks", type: "Outfit guide", minutes: 4, title: "5 ways to wear Nike Dunks", intro: "Dunks are the easiest sneaker in the rack to style. The shape is clean, the colourways go loud or quiet, and they work from the lecture hall to Friday night. Here are five looks we keep coming back to.", tone: "navy" as Tone, kind: "sneaker" as ArtKind },
  { slug: "find-your-true-sneaker-size", type: "How-to", minutes: 3, title: "Find your true sneaker size before you order", intro: "Ordering sneakers online is easy once you know your size. Measure your foot at the end of the day, stand on a sheet of paper, mark the heel and the longest toe, and measure the gap. Then check the fit notes on each product page, because brands run differently.", tone: "grey" as Tone, kind: "sneaker" as ArtKind },
  { slug: "keep-white-sneakers-white", type: "How-to", minutes: 3, title: "How to keep white sneakers white", intro: "White sneakers look best when they are cared for early. Wipe them down after each wear with a damp cloth, use a soft brush and mild soap for deeper marks, and let them dry away from direct sun. Never put them in a washing machine.", tone: "blue" as Tone, kind: "sneaker" as ArtKind },
  { slug: "what-accra-and-kumasi-are-wearing", type: "Trends", minutes: 5, title: "What Accra and Kumasi are wearing this month", intro: "Clean low-tops, oversized tees and matching sets are everywhere this month, with one bright colour pop on the shoe. Here is what we are seeing on the streets of Accra and Kumasi.", tone: "charcoal" as Tone, kind: "apparel" as ArtKind },
];

export const trackerSteps = [
  { label: "Order placed", note: "Today, 9:12" },
  { label: "Payment confirmed", note: "Paid in full, GHS 400 by MTN MoMo · 9:13" },
  { label: "Confirmed by Drezzy", note: "Kwame from the Kumasi branch · 9:31" },
  { label: "Getting your item from our supplier", note: "Ordered 9:45 · received at the Kumasi branch 10:20" },
  { label: "Checked and packed", note: "Size, colour and condition checked · 10:40" },
  { label: "Dispatched", note: "Rider: Yaw · 020 000 0000 · 11:05" },
  { label: "Out for delivery", note: "On the way to Adum, Kumasi. The rider will call when close." },
  { label: "Delivered", note: "You will get a short code to give the rider." },
];

export const sources = [
  "Instagram", "TikTok", "Snapchat", "Facebook", "X (Twitter)", "Threads", "WhatsApp", "Google search",
  "YouTube", "Friend or relative", "Referral", "Influencer", "Walk-in", "Flyer or poster", "Other",
];

export const branches = {
  accra: { name: "Accra", call: "054 899 6648", whatsapp: "050 131 5862", wa: "233501315862" },
  kumasi: { name: "Kumasi", call: "055 355 7347", whatsapp: "055 355 7347", wa: "233553557347" },
};

/**
 * Delivery zones. DEFAULT sample fees and times, to be set by the owner in Settings (PRD section 9).
 * `days` is the delivery time for the region; the supplier lead time of the items is added on top.
 * The Accra zone is the only one that can pay half now, half on delivery.
 */
export type Zone = { region: string; fee: number; days: number; accra?: boolean };

export const zones: Zone[] = [
  { region: "Greater Accra", fee: 30, days: 1, accra: true },
  { region: "Ashanti", fee: 50, days: 2 },
  { region: "Central", fee: 55, days: 3 },
  { region: "Eastern", fee: 55, days: 3 },
  { region: "Western", fee: 60, days: 3 },
  { region: "Volta", fee: 60, days: 3 },
  { region: "Bono", fee: 65, days: 4 },
  { region: "Ahafo", fee: 65, days: 4 },
  { region: "Bono East", fee: 65, days: 4 },
  { region: "Western North", fee: 70, days: 4 },
  { region: "Oti", fee: 70, days: 4 },
  { region: "Northern", fee: 80, days: 5 },
  { region: "Savannah", fee: 80, days: 5 },
  { region: "North East", fee: 85, days: 5 },
  { region: "Upper East", fee: 85, days: 5 },
  { region: "Upper West", fee: 85, days: 5 },
];

export const getZone = (region: string) => zones.find((z) => z.region === region);
