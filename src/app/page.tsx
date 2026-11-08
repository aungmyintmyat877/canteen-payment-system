import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import T from "@/lib/i18n/T";
import LanguageToggle from "@/lib/i18n/LanguageToggle";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  if (session) {
    if (session.role === "student") redirect("/student");
    redirect(homeFor(session.role));
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 text-white">
            {/* 🌟 နောက်ခံ ဘယ်ကနေ ညာကို အလျားလိုက် ရွေ့နေတဲ့ စာသားများ (Full Page) 🌟 */}
      <div className="absolute inset-0 z-0 flex flex-col justify-around overflow-hidden opacity-15 pointer-events-none select-none">
        
        {/* အတန်း ၁ - အပေါ်ဆုံး */}
        <div className="flex whitespace-nowrap animate-marquee">
          <span className="text-5xl md:text-8xl font-extrabold text-white tracking-widest uppercase">
            University Of Computer Studies Taungoo &nbsp;&nbsp;&nbsp;
          </span>
          <span className="text-5xl md:text-8xl font-extrabold text-white tracking-widest uppercase">
            University Of Computer Studies Taungoo &nbsp;&nbsp;&nbsp;
          </span>
        </div>

        {/* အတန်း ၂ - အပေါ်လယ် */}
        <div className="flex whitespace-nowrap animate-marquee" style={{ animationDirection: 'reverse', animationDuration: '30s' }}>
          <span className="text-4xl md:text-7xl font-extrabold text-white tracking-widest uppercase">
            Canteen System &nbsp;&nbsp;&nbsp; Cashless Payment &nbsp;&nbsp;&nbsp; Digital ID &nbsp;&nbsp;&nbsp;
          </span>
          <span className="text-4xl md:text-7xl font-extrabold text-white tracking-widest uppercase">
            Canteen System &nbsp;&nbsp;&nbsp; Cashless Payment &nbsp;&nbsp;&nbsp; Digital ID &nbsp;&nbsp;&nbsp;
          </span>
        </div>

        {/* အတန်း ၃ - အောက်လယ် */}
        <div className="flex whitespace-nowrap animate-marquee" style={{ animationDuration: '20s' }}>
          <span className="text-3xl md:text-6xl font-extrabold text-white tracking-widest uppercase">
            Welcome to UCSTGO Canteen &nbsp;&nbsp;&nbsp; Scan QR to Pay &nbsp;&nbsp;&nbsp;
          </span>
          <span className="text-3xl md:text-6xl font-extrabold text-white tracking-widest uppercase">
            Welcome to UCSTGO Canteen &nbsp;&nbsp;&nbsp; Scan QR to Pay &nbsp;&nbsp;&nbsp;
          </span>
        </div>
        
        {/* အတန်း ၄ - အောက်ဆုံး */}
        <div className="flex whitespace-nowrap animate-marquee" style={{ animationDirection: 'reverse', animationDuration: '35s' }}>
          <span className="text-5xl md:text-8xl font-extrabold text-white tracking-widest uppercase">
            University Of Computer Studies Taungoo &nbsp;&nbsp;&nbsp;
          </span>
          <span className="text-5xl md:text-8xl font-extrabold text-white tracking-widest uppercase">
            University Of Computer Studies Taungoo &nbsp;&nbsp;&nbsp;
          </span>
        </div>

      </div>
      
      {/* ⬇️ သင့်ရဲ့ အဓိက Content တွေ (z-10) ⬇️ */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
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