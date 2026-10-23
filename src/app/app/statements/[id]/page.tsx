import { StatementDetail } from "@/features/statements/detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StatementDetail key={id} id={id} />;
}
