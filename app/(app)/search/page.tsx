import { SearchView } from "@/components/pages/search";

export const metadata = { title: "Suche" };
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <SearchView initial={q ?? ""} />;
}
