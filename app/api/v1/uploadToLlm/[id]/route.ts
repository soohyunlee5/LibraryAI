import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return new Response("Unauthorized", { status: 401 });

    const { data: chat, error } = await supabase
        .from("chats")
        .select("id,user_id,file_path,file_name,file_type")
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .single();
    if (error || !chat?.file_path) return new Response("Not found", { status: 404 });

    const admin = createAdminClient();
    const { data: signed, error: signErr } = await admin.storage.from("books").createSignedUrl(chat.file_path, 60 * 10);
    if (signErr || !signed?.signedUrl) return new Response("Could not sign URL", { status: 500 });

    const upstream = await fetch(signed.signedUrl);
    if (!upstream.ok) return new Response("Failed to fetch book", { status: 502 });

    const bookBlob = await upstream.blob();
    const filename = chat.file_name || "file.pdf";

    const form = new FormData();
    form.append("pdf_file", bookBlob, filename);

    const llmRes = await fetch("https://iampratham29-AI-bookshelf-rag.hf.space/upload", {
        method: "POST",
        body: form,
    });
    
    if (!llmRes.ok) {
        const errText = await llmRes.text();
        return new Response(errText || "LLM upload failed", { status: 502 });
    }

    return Response.json({ uploaded: true });
}
