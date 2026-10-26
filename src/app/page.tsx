import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import T from "@/lib/i18n/T";
import LanguageToggle from "@/lib/i18n/LanguageToggle";

// STEP 1 က ကူးထားတဲ့ LanguageToggle import line ကို ဒီအောက်မှာ paste ပါ

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  // login ဝင်ထားပြီးသားဆိုရင် ကိုယ့် portal ဆီ တန်းပို့မယ်
  if (session) {
    if (session.role === "student") redirect("/student");
    redirect(homeFor(session.role));
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 text-white">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-200">
          <T k="home.university" />
        </p>

        <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-snug sm:text-4xl md:text-5xl">
  <T k="home.title" />
</h1>

        <p className="mt-4 max-w-2xl text-lg text-blue-100">
          <T k="home.subtitle" />
        </p>

        <Link
          href="/login"
          className="mt-8 inline-block rounded-2xl bg-white px-8 py-4 text-lg font-bold text-blue-800 shadow-lg transition hover:bg-blue-50"
        >
          <T k="home.loginBtn" />
        </Link>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          <section className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
            <h2 className="text-xl font-bold"><T k="home.studentsTitle" /></h2>
            <p className="mt-3 text-blue-100"><T k="home.studentsDesc" /></p>
          </section>

          <section className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
            <h2 className="text-xl font-bold"><T k="home.cashierTitle" /></h2>
            <p className="mt-3 text-blue-100"><T k="home.cashierDesc" /></p>
          </section>

          <section className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
            <h2 className="text-xl font-bold"><T k="home.adminTitle" /></h2>
            <p className="mt-3 text-blue-100"><T k="home.adminDesc" /></p>
          </section>
        </div>
      </div>
    </main>
  );
}