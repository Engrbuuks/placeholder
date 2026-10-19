// Shared loading for app pages: the session, the workspace, and the props the shell needs.
import { redirect } from "next/navigation";
import { requireSession } from "./auth";
import { getWorkspace, latestAudits } from "./workspaces";

export async function loadAppPage() {
  const session = await requireSession();
  const workspace = await getWorkspace(session.workspaceId);
  if (!workspace) redirect("/login");
  if (workspace.onboardingStep !== "done") redirect("/onboarding");
  const [audit] = await latestAudits(session.workspaceId, 1);
  return {
    session,
    workspace,
    shell: {
      workspaceId: session.workspaceId,
      businessName: workspace.name,
      country: workspace.country,
      fullName: session.fullName,
      email: session.email,
      lastChecked: audit?.createdAt ?? null,
    },
  };
}
