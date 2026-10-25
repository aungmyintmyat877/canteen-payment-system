"use client";

import { useLang } from "./LanguageProvider";


// Server Component ထဲမှာ သုံးပုံ: <T k="nav.home" />
export default function T({ k }: { k: string }) {
  const { t } = useLang();
  return <>{t(k)}</>;
}