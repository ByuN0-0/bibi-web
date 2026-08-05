import Image from "next/image";
import React from "react";
import type {Role} from "@/lib/lol/types";
import {ROLE_LABEL} from "@/lib/lol/types";

const LOL_UI_ASSET_ROOT = "/images/lol/ui";

const OBJECTIVE_ASSET = {
  turret: `${LOL_UI_ASSET_ROOT}/turret.png`,
  dragon: `${LOL_UI_ASSET_ROOT}/dragon.png`,
} as const;

const POSITION_ASSET: Record<Role, string> = {
  TOP: `${LOL_UI_ASSET_ROOT}/position-top.png`,
  JUNGLE: `${LOL_UI_ASSET_ROOT}/position-jungle.png`,
  MIDDLE: `${LOL_UI_ASSET_ROOT}/position-middle.png`,
  BOTTOM: `${LOL_UI_ASSET_ROOT}/position-bottom.png`,
  UTILITY: `${LOL_UI_ASSET_ROOT}/position-utility.png`,
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
          backgroundImage: `url(${LOL_UI_ASSET_ROOT}/gold.png)`,
          backgroundPosition: "center 1px",
          backgroundSize: `${size}px ${Math.round(size * 96 / 56)}px`,
        }}
      />
    );
  }
  return <Image src={OBJECTIVE_ASSET[kind]} alt={label} title={label} width={size} height={size} sizes={`${size}px`} unoptimized className="shrink-0 object-contain" />;
}

export function LolPositionIcon({role, size = 16}: {role: Role; size?: number}) {
  return <Image src={POSITION_ASSET[role]} alt={ROLE_LABEL[role]} title={ROLE_LABEL[role]} width={size} height={size} sizes={`${size}px`} unoptimized className="shrink-0 object-contain" />;
}
