import { redirect } from "next/navigation";
import { getSessionUser } from "../src/server/auth/sessionUser";
import { getRepo } from "../src/server/repo";
import { Dashboard } from "../src/ui/dashboard/Dashboard";

export const runtime = "nodejs";

/** Home — the signed-in user's proposal dashboard. */
export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  const [proposals, folders] = await Promise.all([
    getRepo().listProposals(user.id),
    getRepo().listFolders(user.id),
  ]);
  return <Dashboard initialProposals={proposals} initialFolders={folders} isAdmin={user.isAdmin} />;
}
