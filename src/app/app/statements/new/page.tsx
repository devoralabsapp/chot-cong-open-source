import { StatementEditor } from "@/features/statements/editor";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const { studentId } = await searchParams;
  return (
    <StatementEditor
      initialStudentId={typeof studentId === "string" ? studentId : ""}
    />
  );
}
