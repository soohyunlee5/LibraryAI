import { createClient } from "@/lib/supabase/server";
import Header from "../../components/Header";
import ChatUI from "../../components/ChatUI";

export default async function Chat({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ ids?: string }>;
}) {
    const { id: chatId } = await params;

    return (
        <main className="flex flex-col min-h-screen">
            <Header />
            <ChatUI chatId={chatId} />
        </main>
    )
}
