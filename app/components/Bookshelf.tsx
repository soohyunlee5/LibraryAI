"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ChangeEvent, DragEvent } from "react";
import AddBookButton from "./AddBookButton";
import BookSpine from "./BookSpine";
import MetadataForm from "./MetadataForm";

type Book = {
    id: string,
    fileName: string,
    title: string,
    author?: string,
    position: number
};

export default function Bookshelf() {
    const fileRef = useRef<HTMLInputElement>(null);
    const draggedIdRef = useRef<string | null>(null);
    const draggedImageRef = useRef<HTMLDivElement | null>(null);
    const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
    const transparentPixelRef = useRef<HTMLImageElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [books, setBooks] = useState<Book[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [pendingBook, setPendingBook] = useState<{
        id: string,
        fileName: string;
    } | null>(null);
    const router = useRouter();

    function uploadFile() {
        fileRef.current?.click();
    }

    useEffect(() => {
        let ignore = false;

        async function fetchBooks() {
            try {
                const res = await fetch("/api/v1/chats");
                if (res.status === 401) {
                    if (!ignore) {
                        setBooks([]);
                    }
                    return;
                }
                if (!res.ok) {
                    const message = await res.text();
                    throw new Error(message || "Failed to load books");
                }
                const data: Array<{ id: string, name: string, author?: string | null, file_name: string, file_size: number, position?: number | null }> = await res.json();
                if (!ignore) {
                    setBooks(
                        data.map((chat, index) => ({
                            id: chat.id,
                            title: chat.name,
                            author: chat.author ?? undefined,
                            fileName: chat.file_name,
                            position: chat.position ?? index
                        })),
                    );
                }
            } catch (error) {
                console.error(error);
                if (!ignore) {
                    alert("Failed to load your books");
                }
            }
        }

        fetchBooks();

        return () => {
            ignore = true;
        };
    }, []);

    async function handleMetadataSubmit({ title, author }: { title: string, author?: string }) {
        if (!pendingBook) {
            return;
        }

        const payload = { title, author };

        try {
            const res = await fetch(`/api/v1/chats/${pendingBook.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const message = await res.text();
                throw new Error(message || "Failed to save metadata");
            }

            const { chat, warning }: { chat: { id: string, name: string, author?: string | null, file_name: string, position?: number | null }, warning?: string } = await res.json();

            if (warning) {
                console.warn(warning);
            }

            const newBook = {
                id: chat.id,
                fileName: chat.file_name,
                title: chat.name,
                author: chat.author ?? undefined,
                position: chat.position ?? Date.now()
            };

            setBooks(prevBooks => {
                const withoutDup = prevBooks.filter(book => book.id !== newBook.id);
                return [...withoutDup, newBook];
            });
            setPendingBook(null);
            if (fileRef.current) {
                fileRef.current.value = "";
            }
        } catch (error) {
            console.error(error);
            alert("Failed to save metadata. Please try again.");
        }
    }

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) { return; }
        
        const file = e.target.files[0];

        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            alert("Please upload a PDF");
            if (fileRef.current) { 
                fileRef.current.value = ""; 
            }
            return;
        }

        setUploading(true);
        
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("name", file.name);
            const res = await fetch("/api/v1/createChat", { method: "POST", body: formData });
            if (!res.ok) {
                const message = await res.text();
                throw new Error(message || "Upload failed, please try again");
            } else {
                const { id } = await res.json();
                setPendingBook({
                    id,
                    fileName: file.name
                });

                try {
                    const llmRes = await fetch(`/api/v1/uploadToLlm/${id}`, { method: "POST" });
                    if (!llmRes.ok) {
                        const message = await llmRes.text();
                        console.error("LLM upload failed:", message);
                        alert("Book saved, but sending to LLM failed. Please try again.");
                    }
                } catch (err) {
                    console.error("LLM upload error:", err);
                    alert("Book saved, but sending to LLM failed. Please try again.");
                }
            }

        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Upload failed, please try again";
            alert(message);
        } finally {
            setUploading(false);
            if (fileRef.current) { 
                fileRef.current.value = ""; 
            }
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Delete this book?")) { return; }
        let res: Response;
        try {
            res = await fetch(`/api/v1/chats/${id}`, { method: "DELETE" });
        } catch (error) {
            console.error(error);
            alert("Something went wrong, please try again");
            return;
        }

        if (res.status === 204) {
            setBooks(prev => prev.filter(book => book.id !== id));
            setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
            return;
        }

        if (res.status === 401) {
            setBooks([]);
            alert("Please sign in to manage books");
            return;
        }

        const message = await res.text();
        alert(message || "Delete failed, please try again");
    }

    function toggle(id: string) {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(existingId => existingId !== id) : [...prev, id]
        );
    }

    function startChat() {
        if (selectedIds.length === 0) {
            return;
        }
        const primaryId = selectedIds[0];
        const url = `/chat/${primaryId}?ids=${selectedIds.join(",")}`;
        router.push(url);
    }

    async function persistOrder(nextBooks: Book[]) {
        try {
            const res = await fetch("/api/v1/chats/order", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: nextBooks.map((book) => book.id) })
            });
            if (!res.ok) {
                const message = await res.text();
                throw new Error(message || "Failed to save order");
            }
        } catch (error) {
            console.error("Order save failed", error);
        }
    }

    function reorderBooks(draggedId: string, targetId: string) {
        const visual = [...books].reverse();
        const fromIndex = visual.findIndex(b => b.id === draggedId);
        const toIndex = visual.findIndex(b => b.id === targetId);
        if (fromIndex === -1 || toIndex === -1) { return books; }

        const [moved] = visual.splice(fromIndex, 1);
        visual.splice(toIndex, 0, moved);
        const dataOrder = visual.reverse();
        return dataOrder.map((book, index) => ({ ...book, position: index }));
    }

    function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
        draggedIdRef.current = id;
        const spineEl = e.currentTarget;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            const rect = spineEl.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;
            dragOffsetRef.current = { x: offsetX, y: offsetY };

            const clone = spineEl.cloneNode(true) as HTMLDivElement;
            clone.style.position = "fixed";
            clone.style.left = `${e.clientX - offsetX}px`;
            clone.style.top = `${e.clientY - offsetY}px`;
            clone.style.width = `${spineEl.offsetWidth}px`;
            clone.style.height = `${spineEl.offsetHeight}px`;
            clone.style.pointerEvents = "none";
            clone.style.zIndex = "9999";
            document.body.appendChild(clone);
            draggedImageRef.current = clone;

            if (!transparentPixelRef.current) {
                const transparentPixel = new Image();
                transparentPixel.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
                transparentPixelRef.current = transparentPixel;
            }
            e.dataTransfer.setDragImage(transparentPixelRef.current, 0, 0);
        }
        spineEl.classList.add("dragging");
    }

    function handleDragOver(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
        }
        if (draggedImageRef.current) {
            const offset = dragOffsetRef.current ?? { x: 0, y: 0 };
            draggedImageRef.current.style.left = `${e.clientX - offset.x}px`;
            draggedImageRef.current.style.top = `${e.clientY - offset.y}px`;
        }
    }

    function handleDragEnd(e: DragEvent<HTMLDivElement>) {
        const spineEl = e.currentTarget;
        spineEl.classList.remove("dragging");
        draggedIdRef.current = null;
        dragOffsetRef.current = null;

        if (draggedImageRef.current) {
            draggedImageRef.current.remove();
            draggedImageRef.current = null;
        }
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>, targetId: string) {
        e.preventDefault();
        const draggedId = draggedIdRef.current;
        if (!draggedId || draggedId === targetId) { return; }

        const firstRects: Record<string, DOMRect> = {};
        books.forEach((book) => {
            const el = document.querySelector<HTMLElement>(`[data-book-id="${book.id}"]`);
            if (!el) { return; }
            firstRects[book.id] = el.getBoundingClientRect();
        })

        const reordered = reorderBooks(draggedId, targetId);
        if (reordered !== books) {
            setBooks(reordered);
            void persistOrder(reordered);
        }

        requestAnimationFrame(() => {
            const lastRects: Record<string, DOMRect> = {};
            const elements = document.querySelectorAll<HTMLElement>("[data-book-id]");
            elements.forEach((el) => {
                const id = el.getAttribute("data-book-id");
                if (!id) { return; }
                lastRects[id] = el.getBoundingClientRect();
            });
            Object.keys(lastRects).forEach((id) => {
                const firstRect = firstRects[id];
                const lastRect = lastRects[id];
                if (!firstRect || !lastRect) return;

                const dx = firstRect.left - lastRect.left;
                const dy = firstRect.top - lastRect.top;
                if (dx === 0 && dy === 0) return;

                const el = document.querySelector<HTMLElement>(`[data-book-id="${id}"]`);
                if (!el) return;

                el.style.transform = `translate(${dx}px, ${dy}px)`;
                requestAnimationFrame(() => {
                    el.style.transform = "";
                });
            });
        });
        draggedIdRef.current = null;
    }

    return (
        <>
            <section className="mx-auto w-full max-w-[58.33vw]">
                <div className="border rounded-[8px] min-h-[60vh] flex flex-col-reverse">
                    {books.length === 0 ? 
                        <p className="m-auto whitespace-pre-line text-center">
                            {`I'm empty,\nplease log in to start adding books!`}
                        </p>
                    : 
                        books.map((book) => (
                        <BookSpine key={book.id} book={book} onDelete={() => handleDelete(book.id)} onToggle={() => toggle(book.id)} isSelected={selectedIds.includes(book.id)} onDragStart={(e) => handleDragStart(e, book.id)} onDragOver={(e) => handleDragOver(e)} onDragEnd={(e) => handleDragEnd(e)} onDrop={(e) => handleDrop(e, book.id)} draggable={true}/>
                    ))}
                </div>
            </section>
            {pendingBook && 
                createPortal(
                    <div className="fixed inset-0 w-screen h-screen flex justify-center items-center z-50 bg-slate-900/50">
                        <MetadataForm 
                            pendingBook={pendingBook}
                            onSubmit={handleMetadataSubmit}
                            onCancel={() => {
                                setPendingBook(null);
                                if (fileRef.current) {
                                    fileRef.current.value = "";
                                }}} />
                    </div>,
                    document.body
                )}
            <AddBookButton 
                uploadFile={uploadFile} 
                uploading={uploading} 
                fileRef={fileRef} 
                handleFileChange={handleFileChange} 
            />
            {selectedIds.length > 0 ? 
                <button onClick={startChat} className="w-fit m-auto border text-base text-white bg-[#383838] py-2.5 px-4 rounded-[8px] border-[#383838] transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[#575757] hover:border-[#575757]">
                    Start chat
                </button>
            :
                <button disabled className="w-fit m-auto border text-base text-white bg-[#383838] py-2.5 px-4 rounded-[8px] border-[#383838] transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[#575757] hover:border-[#575757]">
                    Select books to start chat
                </button>
            }
        </>
    );
}
