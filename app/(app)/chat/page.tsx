import { ChatView } from "@/components/chat/chat-view";

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <ChatView conversationId={null} initialQuery={q} />;
}
