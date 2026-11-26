import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { MapBackdrop } from "@/components/landing/backdrop";
import { JoinForms } from "./join-forms";
import { getPublicEvent } from "@/lib/server/public-event";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join the hunt" };

export default async function JoinPage() {
  const pub = await getPublicEvent();
  return (
    <main className="relative min-h-dvh">
      <MapBackdrop />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
        <Link href="/" className="mb-8 self-start">
          <Logo />
        </Link>
        <Suspense>
          <JoinForms registrationOpen={pub.event?.registration_open ?? false} eventName={pub.event?.name ?? null} configured={pub.configured} />
        </Suspense>
        <p className="mt-auto pt-8 text-center text-xs text-slate-600">
          Organiser? <Link href="/admin/login" className="text-slate-400 underline-offset-2 hover:underline">Admin login</Link>
        </p>
      </div>
    </main>
  );
}
