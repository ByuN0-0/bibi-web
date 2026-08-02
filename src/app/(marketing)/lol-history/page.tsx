import {redirect} from "next/navigation";

export default function LegacyLolHistoryPage() {
  redirect("/lol-member?tab=history");
}
