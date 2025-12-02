# README

Welcome to LibraryAI! 
Let's turns your scattered lecture PDFs, research papers, and work documents into an organized, AI powered bookshelf.
Upload, explore, and keep context across your entire library.

Built with Next.js App Router, Supabase Auth and Storage, Tailwind, TypeScriptt, CSS, React shadcn/ui and more!

<img width="1920" height="1080" alt="Frontend Pic 1" src="https://github.com/user-attachments/assets/507bf4eb-e6b0-4243-a00c-81df93d8ad72" />

<img width="1921" height="1080" alt="Frontend Pic 2" src="https://github.com/user-attachments/assets/bfb268d4-656f-45b3-8545-d5717962027d" />

## Problem

Users need a simple way to ask questions about their own documents and keep conversations organized. Most tooling is either too complex or doesn't prioritize an intuitive, bookshelf-like UI for per-document chats.

## MVP scope

- Auth: email/password via Supabase (cookie-based with `@supabase/ssr`).
- Create chat by uploading a PDF (max 50 MB) to the `books` bucket.
- Bookshelf: list chats, ordered by `position`/`created_at` with drag/sort behavior.
- Chat: send a message and get a mock assistant reply grounded in the file metadata (demo only).
- Rename chat (title and optional author), delete chat (removes storage file if present).
- View full message history per chat.

## System Design Sketch
<img width="1791" height="706" alt="image" src="https://github.com/user-attachments/assets/478db970-dc83-48b3-ad35-e99513ce0b91" />

## Frontend UI Sketch 
<img width="1024" height="768" alt="Frontend Sketch" src="https://github.com/user-attachments/assets/adb4a5a3-776c-418c-bd9c-0d40b5957679" />

## Frontend Codebase

- Framework and routing
  - Next.js App Router in `app/` with a mix of Server and Client Components.
  - Global styles in `app/globals.css`; Tailwind configured via `tailwind.config.ts` and `postcss.config.mjs`.
- Top-level views
  - `app/page.tsx` renders `app/components/App.tsx`, which composes `Header` and `Bookshelf`.
  - `app/chat/[id]/page.tsx` renders the chat view for a given `chatId`, passing it (and optional `ids` list) to `ChatUI`.
- Header and auth UX
  - `app/components/Header.tsx` (Server Component) uses `lib/supabase/server.ts` to read the user and switch between Log In/Sign Up links and `UserMenu`.
  - Login: `app/login/page.tsx` + `app/login/LogInForm.tsx` with Supabase client auth.
  - Signup: `app/signup/page.tsx` + `app/signup/SignUpForm.tsx` (includes simple confirmation flow).
- Bookshelf UI
  - `app/components/Bookshelf.tsx` (Client) loads chats (`GET /api/v1/chats`), uploads PDFs (`POST /api/v1/createChat`), saves metadata (`PATCH /api/v1/chats/:id`), deletes chats (`DELETE /api/v1/chats/:id`), and persists order (`PATCH /api/v1/chats/order`).
  - Custom drag-and-drop: creates a ghost element on drag, tracks the cursor offset, and animates reordering using first/last DOM rects.
  - `app/components/AddBookButton.tsx`: Hidden file input trigger with busy/disabled state.
  - `app/components/BookSpine.tsx`: Single row item with select/delete and DnD handlers.
  - `app/components/MetadataForm.tsx`: Modal to set `title` and optional `author` after upload.
- Chat UI
  - `app/components/ChatUI.tsx`: Loads history (`GET /api/v1/getHistory/:id`), sends messages (`POST /api/v1/updateChat/:id`), auto-resizes textarea, and renders user/assistant bubbles.

## Backend Codebase

- Auth/session middleware
  - `middleware.ts` calls `lib/supabase/middleware.ts:updateSession` to synchronize Supabase sessions via cookies and redirect unauthenticated users away from protected pages.
  - Supabase helpers: `lib/supabase/server.ts` (server-side client with cookies) and `lib/supabase/client.ts` (browser client).
- Data model and security
  - See `SUPABASE_SCHEMA.md` for `chats` and `messages` tables, helpful indexes, and RLS policies limiting access to a user's own data.
  - Files upload to Storage bucket `books` at `{user_id}/{chat_id}.pdf` with policies restricting access to the owner prefix.
- API routes (`app/api/v1/...`)
  - `chats/route.ts` (GET): List chats for the signed-in user, ordered by `position` then `created_at`.
  - `createChat/route.ts` (POST): Validate PDF (type/size), create a chat row to get an id, upload to Storage, set `file_path`, and seed a welcome assistant message.
  - `getHistory/[id]/route.ts` (GET): Return chat metadata and ordered message history.
  - `updateChat/[id]/route.ts` (POST): Insert the user message; generate a mock assistant response (see 'Haiku detection' below) and persist it.
  - `chats/[id]/route.ts` (PATCH/DELETE): Update title/author or delete the chat and attempt to remove the Storage object.
  - `chats/order/route.ts` (PATCH): Validate unique ids, verify ownership, and assign new `position` values in order.
- Haiku detection: sliding window + greedy
  - Location: `app/api/v1/updateChat/[id]/route.ts` in `isHaikuFlexible(message: string)` with helper `countSyllables(word: string)`.
  - Exact 3-line path: If the user types exactly three lines, the function counts syllables per line and requires 5-7-5 exactly.
  - Flexible single-line path: Otherwise, it treats the entire message as a stream of words and greedily builds three segments with targets `[5,7,5]`.
    - Sliding window: Iterate words once, maintaining a running syllable sum for the current segment (the right pointer advances with each word). When the sum meets the current target, close that segment and advance to the next target. If the sum exceeds the target at any point, fail early.
    - Greedy choice: Always accept the earliest boundary where the sum equals the target before moving on. This single pass with early exit is optimal for the 5-7-5 constraint and avoids backtracking.
  - Syllables: `countSyllables` lowercases and strips non-letters, counts transitions into vowel groups, and ensures a minimum of 1 per word.

## AI Layer

- Current MVP: The "assistant" response is a mock template grounded in the uploaded file's metadata (e.g., file name/size) and optionally appends a haiku note if detection passes.
- Future direction (examples):
  - Replace mock reply with an LLM call and retrieval-augmented generation (RAG) over chunked PDF embeddings.
  - Store embeddings and chunk metadata alongside `chats`, secure by user id. Use Supabase functions or edge workers for inference orchestration.
  - Stream tokens to the client for a live chat feel.
  
## API

All endpoints require an authenticated Supabase user (cookies). Response codes reflect success/errors as shown.

- GET `/api/v1/chats`
  - Returns: `[{ id, name, author, created_at, file_name, file_size, position }]`

- POST `/api/v1/createChat` (multipart/form-data)
  - Fields: `file` (PDF), `name` (string, optional)
  - Returns: `{ id }`

- GET `/api/v1/getHistory/:id`
  - Returns: `{ chat, history: [{ id, role, content, created_at }] }`

- POST `/api/v1/updateChat/:id`
  - Body: `{ message: string, docIds?: string[] }`
  - Returns: `{ assistant: { id, role, content, created_at } }` (mock reply)

- PATCH `/api/v1/chats/:id`
  - Body: `{ title: string, author?: string | null }`
  - Returns: `{ chat }` (or `{ chat, warning }` if only title saved)

- DELETE `/api/v1/chats/:id`
  - Returns: `204 No Content` (also attempts to remove the stored PDF)

- PATCH `/api/v1/chats/order`
  - Body: `{ ids: string[] }` (new shelf order)
  - Returns: `204 No Content`

Refer to `SUPABASE_SCHEMA.md` for the database and storage schema used by these routes.

## Setup

Prerequisites: Node.js 18+, npm.

1) Create a Supabase project and a Storage bucket named `books` (private).

2) In Supabase SQL Editor, run the SQL from `SUPABASE_SCHEMA.md` to create tables, indexes, RLS, and storage policies.

3) Create `/.env.local` with your project values:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-or-anon-key
```

4) Install and run locally:

```
npm install
npm run dev
```

Open http://localhost:3000, sign up, and you'll be redirected by middleware when needed.

Notes:
- UI uses Tailwind + shadcn/ui. If you want different shadcn styles, adjust `components.json` and re-install per shadcn docs.
- Auth is cookie-based via `@supabase/ssr`; the Next.js middleware enforces redirects for unauthenticated routes.

## Demo script

Use this script to demonstrate the MVP flow:

1) Sign up / log in.
2) Click "Add Book" and upload a PDF (<= 50 MB). Name the chat.
3) Observe a welcome message seeded for the new chat.
4) Ask a question about the PDF; see the mock assistant reply referencing the file metadata. Try a 5-7-5 haiku to trigger the easter egg.
5) Rename the chat title and (optionally) set an author; confirm it persists.
6) Reorder items on the shelf (drag or via UI action) and confirm the new order persists.
7) Delete a chat and confirm it disappears and its storage file is removed.

## Work in progress

Deploying to Vercel.

- Create a new Vercel project from this repo.
- Link your Supabase project using the Supabase Vercel Integration (recommended) to auto-inject env vars, or set these variables manually in Vercel Project Settings -> Environment Variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- In your production Supabase project, create the `books` bucket and run the SQL in `SUPABASE_SCHEMA.md` (or your migration of it).
- Trigger a deploy; verify protected routes redirect correctly and that uploads/listing work in production.

## Contributing

See `CONTRIBUTING.md` for a quick guide. In short: fork -> branch -> PR, run `npm run lint` before pushing, and keep changes focused.

## License

MIT (c) 2025 AI Library contributors. See `LICENSE` for details.

