import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { getMergedSectionTypes } from "../../src/server/registry/activeRegistry";
import { getMergedTemplates } from "../../src/server/registry/activeTemplates";
import { getRepo } from "../../src/server/repo";
import { AdminDashboard } from "../../src/ui/admin/AdminDashboard";

export const runtime = "nodejs";

/** Admin-only Builder dashboard. Middleware also gates /admin; this is defence in depth. */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");

  const [sectionTypes, inUse, templates, inUseTemplates] = await Promise.all([
    getMergedSectionTypes(),
    getRepo().listInUseTypeKeys(),
    getMergedTemplates(),
    getRepo().listInUseTemplateIds(),
  ]);
  return (
    <AdminDashboard
      sectionTypes={sectionTypes}
      inUse={inUse}
      currentUserId={session.user.id}
      templates={templates}
      inUseTemplates={inUseTemplates}
    />
  );
}
