import Image from "next/image";
import type {Role} from "@/lib/lol/types";
import {ROLE_LABEL} from "@/lib/lol/types";

const MATCH_HISTORY_ASSET_ROOT = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-match-history/global/default";
const POSITION_ASSET_ROOT = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions";

const OBJECTIVE_ASSET = {
  turret: `${MATCH_HISTORY_ASSET_ROOT}/tower-100.png`,
  dragon: `${MATCH_HISTORY_ASSET_ROOT}/dragon-100.png`,
} as const;

const POSITION_ASSET: Record<Role, string> = {
  TOP: `${POSITION_ASSET_ROOT}/icon-position-top.png`,
  JUNGLE: `${POSITION_ASSET_ROOT}/icon-position-jungle.png`,
  MIDDLE: `${POSITION_ASSET_ROOT}/icon-position-middle.png`,
  BOTTOM: `${POSITION_ASSET_ROOT}/icon-position-bottom.png`,
  UTILITY: `${POSITION_ASSET_ROOT}/icon-position-utility.png`,
};

export function LolObjectiveIcon({kind, size = 16}: {kind: "gold" | keyof typeof OBJECTIVE_ASSET; size?: number}) {
  const label = kind === "gold" ? "골드" : kind === "turret" ? "포탑" : "드래곤";
  if (kind === "gold") {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className="inline-block shrink-0 bg-no-repeat"
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${MATCH_HISTORY_ASSET_ROOT}/icon_gold.png)`,
          backgroundPosition: "center 1px",
          backgroundSize: `${size}px ${Math.round(size * 96 / 56)}px`,
        }}
      />
    );
  }
  return <Image src={OBJECTIVE_ASSET[kind]} alt={label} title={label} width={size} height={size} sizes={`${size}px`} className="shrink-0 object-contain" />;
}

export function LolPositionIcon({role, size = 16}: {role: Role; size?: number}) {
  return <Image src={POSITION_ASSET[role]} alt={ROLE_LABEL[role]} title={ROLE_LABEL[role]} width={size} height={size} sizes={`${size}px`} className="shrink-0 object-contain" />;
}
