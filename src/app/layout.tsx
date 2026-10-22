import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";
import "./globals.css";

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "Drezzy Stores", template: "%s | Drezzy Stores" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Drezzy", statusBarStyle: "black-translucent" },
  description:
    "Your Outfits Solution. You order, we deliver, you drip. Sneakers, outfits and watches delivered nationwide in Ghana.",
};

export const viewport: Viewport = {
  themeColor: "#00115b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${lexend.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
