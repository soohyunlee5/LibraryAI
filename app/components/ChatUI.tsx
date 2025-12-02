"use client";
import { useEffect, useState, useRef, FormEvent, ChangeEvent } from "react";

type ChatMessage = {
    id: string,
    role: "user" | "assistant",
    content: string
};

type ChatUIProps = {
    chatId: string,
}

export default function ChatUI({ chatId }: ChatUIProps) {
    const [sending, setSending] = useState(false);
    const [text, setText] = useState("");
    const [multiLine, setMultiLine] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    function adjustTextareaHeight(el: HTMLTextAreaElement) {
        const maxHeight = parseInt(getComputedStyle(el).maxHeight, 10);
        const lineHeight = parseInt(getComputedStyle(el).lineHeight);
        const heightLimit = Number.isNaN(maxHeight) ? Infinity : maxHeight;

        el.style.height = "auto";
        const currentHeight = el.scrollHeight;
        const nextHeight = Math.min(currentHeight, heightLimit);
        el.style.height = `${nextHeight}px`;
        el.style.overflowY = currentHeight > heightLimit ? "auto" : "hidden";

        const lines = Math.ceil(currentHeight / lineHeight);
        if (lines > 2) {
            setMultiLine(true);
        } else {
            setMultiLine(false);
        }
    }

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollTop = bottomRef.current.scrollHeight;
        }
    }, [messages])

    useEffect(() => {
        let ignore = false;

        async function loadHistory() {
            try {
                const res = await fetch(`/api/v1/getHistory/${chatId}`);
                if (!res.ok) {
                    const message = await res.text();
                    throw new Error(message || "Failed to load history");
                }
                const data: { history: Array<{ id: string, role: "user" | "assistant", content: string }> } = await res.json();
                if (!ignore && Array.isArray(data.history)) {
                    setMessages(data.history);
                }
            } catch (error) {
                console.error(error);
            }
        }

        loadHistory();
        return () => {
            ignore = true;
        };
    }, [chatId]);

    useEffect(() => {
        if (textareaRef.current) {
            adjustTextareaHeight(textareaRef.current);
        }
    }, [text]);

    function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
        setText(e.target.value);
    }

    async function handleSend(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) {
            return;
        }

        setSending(true);

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: trimmed
        };

        setMessages(prev => [...prev, userMessage]);
        setText("");

        try {
            const res = await fetch(`/api/v1/updateChat/${chatId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: trimmed })
            });
            if (!res.ok) {
                const message = await res.text();
                throw new Error(message || "Failed to send");
            }
            const { assistant }: { assistant: { id: string, role: "assistant", content: string } } = await res.json();
            const assistantMessage: ChatMessage = assistant ?? {
                id: crypto.randomUUID(),
                role: "assistant",
                content: "No response available."
            };
            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error(error);
            const fallbackMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: "Sorry, something went wrong."
            };
            setMessages(prev => [...prev, fallbackMessage]);
        } finally {
            setSending(false);
        }
    }

    return (
        <main className="flex flex-col flex-1 justify-between items-center w-full">
            <section ref={bottomRef} className="w-full pt-5 overflow-y-auto max-h-[75vh]">
                <div className="mx-auto max-w-5xl">
                    <ol>
                        {messages.map(message =>
                            <li key={message.id}>
                                {message.role === "user" ? (
                                    <div className="flex justify-end">
                                        <p className="max-w-2xl whitespace-pre-wrap break-words border rounded-2xl rounded-tr-none bg-slate-100 p-3">
                                            {message.content}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="max-w-5xl whitespace-pre-wrap break-words m-10">
                                            {message.content}
                                        </p>
                                    </div>
                                )}
                            </li>
                        )}
                    </ol>                
                </div>
            </section>
            <form onSubmit={handleSend} className="flex w-full max-w-2xl relative">
                <label htmlFor="chat-input" className="sr-only">
                    Ask a question about the book
                </label>
                <span className="w-full">
                    <textarea 
                        id="chat-input" 
                        name="chat-input"
                        placeholder="Ask a question..." 
                        rows={1} 
                        value={text} 
                        ref={textareaRef}
                        onChange={handleChange}
                        onKeyDown={(e) => {if (e.key === "Enter" && !e.shiftKey) { 
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                        }}}
                        className={`w-full bg-slate-100 border max-h-40 px-3 py-2.5 leading-relaxed mb-10 shadow-sm resize-none absolute bottom-0 ${multiLine ? "rounded-2xl" : "rounded-full"}`}
                    />
                    <button type="submit" disabled={sending} className="absolute right-4 -top-10 -translate-y-9">
                        <svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-6 h-6">
                            <path fillRule="evenodd" clipRule="evenodd" d="M12 3C12.2652 3 12.5196 3.10536 12.7071 3.29289L19.7071 10.2929C20.0976 10.6834 20.0976 11.3166 19.7071 11.7071C19.3166 12.0976 18.6834 12.0976 18.2929 11.7071L13 6.41421V20C13 20.5523 12.5523 21 12 21C11.4477 21 11 20.5523 11 20V6.41421L5.70711 11.7071C5.31658 12.0976 4.68342 12.0976 4.29289 11.7071C3.90237 11.3166 3.90237 10.6834 4.29289 10.2929L11.2929 3.29289C11.4804 3.10536 11.7348 3 12 3Z" fill="#000000"/>
                        </svg>
                    </button>
                </span>
            </form>
        </main>
    )
}
