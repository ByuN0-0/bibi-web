import AdminMatchHistory from "@/app/lol-statics/components/AdminMatchHistory";
import {listMatchResultsPage, listPlayers} from "@/lib/lol/repository";

export default async function HistoryPage({searchParams}: {searchParams: Promise<{open?: string}>}) {
  const [{results, nextOffset}, players, query] = await Promise.all([listMatchResultsPage(0, 10), listPlayers(), searchParams]);
  return <AdminMatchHistory initialResults={results} initialNextOffset={nextOffset} players={players} initialOpenId={query.open ?? null} />;
}
