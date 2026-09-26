const SERIES_LOGOS = Object.freeze({
  Cassandra: "ingress-logo.svg",
  "13MAGNUS": "ingress-logo.svg",
  Recursion: "xm-anomaly-logos/recursion.webp",
  Interitus: "xm-anomaly-logos/interitus.webp",
  Helios: "xm-anomaly-logos/helios.webp",
  Darsana: "xm-anomaly-logos/darsana.webp",
  Shōnin: "xm-anomaly-logos/shonin.webp",
  Persepolis: "xm-anomaly-logos/persepolis.webp",
  Abaddon: "xm-anomaly-logos/abaddon.webp",
  Obsidian: "xm-anomaly-logos/obsidian.webp",
  "Aegis Nova": "xm-anomaly-logos/aegis-nova.webp",
  "Via Lux": "xm-anomaly-logos/via-lux.webp",
  "Via Noir": "xm-anomaly-logos/via-noir.webp",
  "13MAGNUS Reawakens": "xm-anomaly-logos/13magnus-reawakens.webp",
  EXO5: "xm-anomaly-logos/exo5.webp",
  "Cassandra Prime": "xm-anomaly-logos/cassandra-prime.webp",
  "Recursion Prime": "xm-anomaly-logos/recursion-prime.webp",
  "Darsana Prime": "xm-anomaly-logos/darsana-prime.webp",
  "Abaddon Prime": "xm-anomaly-logos/abaddon-prime.webp",
  "Nemesis: Myriad": "xm-anomaly-logos/nemesis-myriad.webp",
  "Nemesis: Umbra": "xm-anomaly-logos/nemesis-umbra.webp",
  "Kureze Effect": "xm-anomaly-logos/kureze-effect.webp",
  Kythera: "xm-anomaly-logos/kythera.webp",
  Superposition: "xm-anomaly-logos/superposition.webp",
  "Epiphany Dawn": "xm-anomaly-logos/epiphany-dawn.webp",
  MZFPK: "xm-anomaly-logos/mzfpk.webp",
  Echo: "xm-anomaly-logos/echo.webp",
  Ctrl: "xm-anomaly-logos/ctrl.webp",
  Discoverie: "xm-anomaly-logos/discoverie.webp",
  "Cryptic Memories": "xm-anomaly-logos/cryptic-memories.webp",
  "Buried Memories": "xm-anomaly-logos/buried-memories.webp",
  "Shared Memories": "xm-anomaly-logos/shared-memories.webp",
  "Erased Memories": "xm-anomaly-logos/erased-memories.webp",
  "+Alpha": "xm-anomaly-logos/plus-alpha.webp",
  "+Theta": "xm-anomaly-logos/plus-theta.webp",
  "+Delta": "xm-anomaly-logos/plus-delta.webp",
  "+Beta": "xm-anomaly-logos/plus-beta.webp",
  "+Gamma": "xm-anomaly-logos/plus-gamma.webp",
  Orion: "xm-anomaly-logos/orion.webp",
  Apollo: "xm-anomaly-logos/apollo.webp",
});

export function xmAnomalyLogoPath(series) {
  return SERIES_LOGOS[series] ?? "ingress-logo.svg";
}

export function hasSeriesSpecificXmAnomalyLogo(series) {
  return SERIES_LOGOS[series]?.startsWith("xm-anomaly-logos/") ?? false;
}
