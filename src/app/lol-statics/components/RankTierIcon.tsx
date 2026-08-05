import Image from "next/image";
import React from "react";
import {rankTierFromText, rankTierIconPath} from "@/lib/lol/team-display";

const TIER_LABEL: Record<ReturnType<typeof rankTierFromText>, string> = {
  UNRANKED: "배치 전",
  IRON: "아이언",
  BRONZE: "브론즈",
  SILVER: "실버",
  GOLD: "골드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  DIAMOND: "다이아몬드",
  MASTER: "마스터",
  GRANDMASTER: "그랜드마스터",
  CHALLENGER: "챌린저",
};

export default function RankTierIcon({rank, size = 36}: {rank: string; size?: number}) {
  const tier = rankTierFromText(rank);
  return <Image src={rankTierIconPath(rank)} alt={`${TIER_LABEL[tier]} 티어`} title={TIER_LABEL[tier]} width={size} height={size} sizes={`${size}px`} unoptimized className="shrink-0 object-contain" />;
}
