"use client";

import Image from "next/image";
import React, {useState} from "react";
import {dataDragonIconUrl} from "@/lib/lol/data-dragon-url";
import type {LolAssetRef} from "@/lib/lol/types";

export default function LolIcon({asset, version, size = 32, className = ""}: {
  asset: LolAssetRef | null;
  version: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!asset || failed) {
    return <span className={`grid shrink-0 place-items-center rounded bg-black/10 text-[9px] text-[var(--muted)] ${className}`} style={{width: size, height: size}} title={asset?.name ?? "빈 슬롯"}>{asset ? asset.name.slice(0, 2) : ""}</span>;
  }
  return (
    <Image
      src={dataDragonIconUrl(version, asset.iconPath)}
      alt={asset.name}
      title={asset.name}
      width={size}
      height={size}
      sizes={`${size}px`}
      unoptimized
      onError={() => setFailed(true)}
      className={`shrink-0 rounded object-cover ${className}`}
    />
  );
}
