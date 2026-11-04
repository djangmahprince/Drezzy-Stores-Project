import Link from "next/link";

export const metadata = { title: "You are offline" };

/** Shown by the service worker when there is no connection and the page was not visited before. */
export default function Offline() {
  return (
    <div className="card mx-auto max-w-md space-y-3 p-8 text-center">
      <p className="label-wide text-text2">No connection</p>
      <h1 className="text-2xl font-bold">You are offline</h1>
      <p className="text-text2">Pages you opened before still work, and your bag is saved on this phone. Reconnect to see live prices and availability.</p>
      <Link href="/cart" className="btn-primary">Open my bag</Link>
    </div>
  );
}
