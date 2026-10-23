import { LessonDetail } from "@/features/classes/lesson-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LessonDetail id={id} />;
}
