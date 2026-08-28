import { redirect } from "next/navigation";

export default async function ClientHome({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  redirect(`/clients/${clientId}/activities`);
}
