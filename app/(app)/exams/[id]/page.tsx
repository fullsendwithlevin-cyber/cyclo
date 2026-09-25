import { ExamDetail } from "@/components/exams/exam-detail";

export const metadata = { title: "Prüfung" };
export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamDetail id={id} />;
}
