import { createClient } from "@/lib/supabase/server";
import UserMenu from "./UserMenu";
import Link from "next/link";

export default async function Header() {
    const supabase = await createClient();
    const currentUser = await supabase.auth.getUser();

    return (
        <header className="flex justify-between py-5 px-5 items-center border-b border-black">
            <h1 className="font-bold text-[1.875rem]">
                <Link href="/">LibraryAI</Link>
            </h1>
            <nav>
                {!currentUser.data.user ? 
                <ul className="flex gap-5">
                    <li>
                        <a href="/login" className="border text-base text-white bg-[#383838] py-2.5 px-4 rounded-[8px] border-[#383838] transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[#575757] hover:border-[#575757]">
                            Log In
                        </a></li>
                    <li>
                        <a href="/signup" className="border text-base py-2.5 px-4 rounded-[8px] border-[#383838] transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[#383838] hover:text-white">
                            Sign Up
                        </a></li>
                </ul> : 
                <UserMenu user={currentUser.data.user} />}
            </nav>
        </header>
    );
}
