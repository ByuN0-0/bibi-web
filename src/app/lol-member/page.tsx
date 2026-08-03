import {redirect} from "next/navigation";

export default async function LolMemberPage({searchParams}: {searchParams: Promise<{tab?: string}>}) {
  const {tab} = await searchParams;
  redirect(tab === "history" ? "/?tab=history" : "/");
}
