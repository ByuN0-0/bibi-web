const DDRAGON_ORIGIN = "https://ddragon.leagueoflegends.com";

export function dataDragonIconUrl(version: string, iconPath: string): string {
  const path = iconPath.startsWith("perk-images/")
    ? `/cdn/img/${iconPath}`
    : `/cdn/${encodeURIComponent(version)}/${iconPath}`;
  return `${DDRAGON_ORIGIN}${path}`;
}
