import { ClassDetail } from "@/features/classes/detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassDetail id={id} />;
}
