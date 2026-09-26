import { DocumentDetail } from "@/components/documents/document-detail";

export const metadata = { title: "Dokument" };
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentDetail id={id} />;
}
