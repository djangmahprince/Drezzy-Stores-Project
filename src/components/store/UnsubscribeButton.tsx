"use client";

import { useState } from "react";
import { unsubscribeAction } from "@/app/(store)/actions";

export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<string | null>(null);
  if (state === "ok") return <p className="font-semibold text-success" role="status">Done. You are unsubscribed.</p>;
  return (
    <>
      <button type="button" className="btn-primary" onClick={async () => { const r = await unsubscribeAction(token); setState(r.ok ? "ok" : r.error); }}>Unsubscribe</button>
      {state && <p role="alert" className="text-sm text-error">{state}</p>}
    </>
  );
}
