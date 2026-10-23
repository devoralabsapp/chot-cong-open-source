import { Workspace } from "@/components/workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Workspace mode="sessions" studentId={id} />;
}
