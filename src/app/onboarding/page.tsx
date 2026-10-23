import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { AppError } from "@/lib/server/errors";
import { getOnboarding } from "@/lib/server/onboarding";
import { AppShell } from "@/components/app-shell";
import { OnboardingGuide } from "@/features/onboarding/guide";
import { getAppearance } from "@/lib/server/appearance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Page() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AppError && error.status === 423)
      redirect("/account/deletion");
    if (error instanceof AppError && error.status === 401)
      redirect("/login?expired=1");
    throw error;
  }
  const initial = await getOnboarding(user.uid);
  const appearance = await getAppearance(user.uid);
  return (
    <AppShell
      name={initial.profile.displayName}
      initialTheme={appearance.theme}
    >
      <OnboardingGuide initial={initial} />
    </AppShell>
  );
}
