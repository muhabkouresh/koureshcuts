import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAdminData } from "@/lib/adminData";
import { siteConfig } from "@/config/site";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return <AdminDashboard data={await getAdminData()} siteName={siteConfig.name} />;
}
