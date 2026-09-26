import { ProjectDetail } from "@/components/projects/project-detail";

export const metadata = { title: "Projekt" };
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetail id={id} />;
}
