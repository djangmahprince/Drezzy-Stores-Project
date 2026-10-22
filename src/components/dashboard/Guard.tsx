import Link from "next/link";
import { Suspense } from "react";
import { authorize } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Action, Module } from "@/lib/permissions";

async function Check({ module, action, children }: { module: Module | Module[]; action: Action; children: React.ReactNode }) {
  const list = Array.isArray(module) ? module : [module];
  const checks = await Promise.all(list.map((m) => authorize(m, action)));
  if (!checks.some((c) => c.allowed)) return <NoAccess />;
  return <>{children}</>;
}

/**
 * Wrap a dashboard page's content. It checks the caller's permission on the server, close to the data,
 * and renders a "no access" message instead of the page when they do not have it. The menu hiding a link is not security.
 * The session read streams in behind its own boundary, so the page shell can still be navigated to instantly.
 */
export function Guard({ module, action = "view", children }: { module: Module | Module[]; action?: Action; children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="space-y-4" aria-busy="true"><div className="h-9 w-56 animate-pulse rounded-[12px] bg-white" /><div className="h-64 animate-pulse rounded-[12px] bg-white" /></div>}>
      <Check module={module} action={action}>{children}</Check>
    </Suspense>
  );
}

export function NoAccess() {
  return (
    <div className="card mx-auto mt-10 max-w-md space-y-3 p-10 text-center">
      <p className="text-lg font-semibold">You don&apos;t have access to this page</p>
      <p className="text-sm text-text2">Your role does not include it. If you need it, ask the Owner or an Admin.</p>
      <Link href="/dashboard" className="btn-primary">Back to your dashboard</Link>
    </div>
  );
}

/** Pages that read or write the database. Without Supabase connected they explain that, instead of failing. */
export function DbGate({ children }: { children: React.ReactNode }) {
  if (isSupabaseConfigured) return <>{children}</>;
  return (
    <div className="card mx-auto mt-6 max-w-lg space-y-3 p-8 text-center">
      <p className="text-lg font-semibold">This needs the database</p>
      <p className="text-sm text-text2">Connect Supabase to manage real staff, roles and the audit log.</p>
      <Link href="/setup" className="btn-primary">See the setup steps</Link>
    </div>
  );
}
