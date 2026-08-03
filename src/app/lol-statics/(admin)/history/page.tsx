import AdminMatchHistory from "@/app/lol-statics/components/AdminMatchHistory";
import {listMatchResultsPage} from "@/lib/lol/repository";

export default async function HistoryPage({searchParams}: {searchParams: Promise<{open?: string}>}) {
  const [{results, nextOffset}, query] = await Promise.all([listMatchResultsPage(0, 10), searchParams]);
  return <AdminMatchHistory initialResults={results} initialNextOffset={nextOffset} initialOpenId={query.open ?? null} />;
}
