import { notFound } from "next/navigation";
import UserDetailClient from "./UserDetailClient";
import { AdminDataUnavailableError, getAdminUserDetail } from "@/lib/admin-data";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return <UserDetailClient user={await getAdminUserDetail(id)} />;
  } catch (error) {
    if (error instanceof AdminDataUnavailableError) return notFound();
    throw error;
  }
}
