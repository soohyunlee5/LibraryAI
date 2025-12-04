import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({}));
  const message = String(body.message || "").trim();
  if (!message) return new Response("message is required", { status: 400 });

  // Ensure chat belongs to user
  const { data: chat } = await supabase
    .from("chats")
    .select("id,name,file_name,file_size,file_path")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .single();
  if (!chat) { return new Response("Not found", { status: 404 }) };

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage.from("books").createSignedUrl(chat.file_path, 60 * 60);
  if (signErr || !signed?.signedUrl) return new Response("Could not sign URL", { status: 500 });

  // Insert user message
  await supabase.from("messages").insert({ chat_id: chat.id, role: "user", content: message });

  const llmRes = await fetch("https://iampratham29-AI-bookshelf-rag.hf.space/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      query: message, 
      fileUrl: signed?.signedUrl,
      filePath: chat.file_path })
  });

  if (!llmRes.ok) {
    const errText = await llmRes.text();
    throw new Error(errText || "LLM request failed");
  }

  const contentType = llmRes.headers.get("content-type") || "";
  const raw = await llmRes.text();
  let replyContent = raw;
  
  if (contentType.includes("application/json")) {
    try {
      const data = JSON.parse(raw);
      replyContent =
        typeof data === "string" ? data : data.answer || data.response || JSON.stringify(data);
    } catch {
      replyContent = raw;
    }
  }

  if (isHaikuFlexible(message)) {
    replyContent += `\n\nBeautiful haiku detected, perfectly structured in the 5-7-5 form.`;
  }

  const { data: inserted, error: chatErr } = await supabase
    .from("messages")
    .insert({ chat_id: chat.id, role: "assistant", content: replyContent })
    .select("id,role,content,created_at")
    .single();
  if (chatErr) return new Response(chatErr.message, { status: 500 });

  return Response.json({ assistant: inserted });
}

//Leetcode Algorithim (Sliding Window and Greedy) to check if there was a Haiku in the user statement

function countSyllables(word: string): number {
  const vowels = new Set(["a","e","i","o","u","y"]);
  word = word.toLowerCase().replace(/[^a-z]/g, "");

  let count = 0;
  let prevVowel = false;

  for (const c of word) {
    const isVowel = vowels.has(c);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }

  return count || 1; // ensure each word counts for at least 1 syllable
}

function isHaikuFlexible(message: string): boolean {
  // Strict mode: user provided exactly 3 lines => enforce fixed 5-7-5 syllables
  const manualLines = message.trim().split(/\n+/);
  if (manualLines.length === 3) {
    const [a, b, c] = manualLines;
    return (
      countSyllables(a) === 5 &&
      countSyllables(b) === 7 &&
      countSyllables(c) === 5
    );
  }

  // Flexible mode: treat the whole text as a continuous stream of words
  const words = message.trim().split(/\s+/);
  if (words.length < 3) return false;

  const targets = [5, 7, 5];  // syllable goals for each haiku line
  let targetIndex = 0;        // which line target we're currently filling
  let syllableSum = 0;        // sliding window syllable accumulator

  for (const w of words) {
    // Greedy step: always add each word's syllables to the current window.
    syllableSum += countSyllables(w);

    // Sliding window idea:
    // - The window expands as we add syllables.
    // - If it hits the exact target, we "close" the window => move to the next line.
    if (syllableSum === targets[targetIndex]) {
      targetIndex++;      // => next haiku segment
      syllableSum = 0;    // => reset window for next segment

      // All 3 segments (5-7-5) matched
      if (targetIndex === 3) return true;
    }

    // If the window exceeds the target, greedy strategy rejects the structure:
    //      => once you overshoot, there's no way to fix the line break.
    if (syllableSum > targets[targetIndex]) return false;
  }

  // If we end without matching all segments exactly => not a haiku
  return false;
}
