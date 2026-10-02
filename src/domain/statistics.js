import {
  formatLocalizedNumber,
  formatLocalizedUnit,
  localeForLanguage,
} from "../i18n/formatters.js";

const REGIONS = ["APAC", "EMEA", "AMER"];

const PUBLISHER_COLORS = {
  resistance: ["#72a9df", "#5596d2", "#8ab9e7", "#3e82bd", "#a4caed", "#2f6fa8", "#bedcf3"],
  enlightened: ["#63d98b", "#43c875", "#7ce5a0", "#2eae60", "#9cecb5", "#238f4e"],
  unknown: ["#687a83"],
};

export const BREAKDOWN_COLORS = [
  "#42d6df",
  "#72a9df",
  "#f2c14e",
  "#63d98b",
  "#a78bfa",
  "#e8896f",
  "#5cc8a1",
  "#c08adf",
  "#d7a84b",
  "#4fa0b5",
  "#88b06a",
  "#cf7f9d",
  "#687a83",
];

function normalizeFaction(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (["R", "RES", "RESISTANCE"].includes(normalized)) return "resistance";
  if (["E", "ENL", "ENLIGHTENED"].includes(normalized)) return "enlightened";
  if (["M", "MACHINA"].includes(normalized)) return "machina";
  if (["N", "NEUTRAL", "NONE"].includes(normalized)) return "neutral";
  return "unknown";
}

export function compactNumber(value, language) {
  return new Intl.NumberFormat(localeForLanguage(language), {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDistance(meters, language) {
  return formatLocalizedUnit(Math.round((meters ?? 0) / 1000), language, "kilometer");
}

export function formatPublisherShare(value) {
  if (value > 0 && value < 0.1) return `${value.toFixed(2)}%`;
  return `${value.toFixed(1)}%`;
}

export function formatDuration(milliseconds, language) {
  const hours = Math.round((milliseconds ?? 0) / 3_600_000);
  if (hours < 1000) return formatLocalizedUnit(hours, language, "hour");
  return formatLocalizedUnit(hours / 24, language, "day", {
    maximumFractionDigits: 0,
  });
}

export function buildStatistics(events, unknownYearLabel) {
  const years = new Map();
  const countries = new Map();
  const regions = new Map(
    REGIONS.map((region) => [
      region,
      {
        region,
        events: 0,
        missions: 0,
        ratings: 0,
        rated: 0,
        completions: 0,
      },
    ]),
  );
  const setSizes = new Map();
  const publishers = new Map();
  const missions = [];
  const ratingEvents = [];
  let missionCount = 0;
  let activeMissions = 0;
  let ratingTotal = 0;
  let ratedMissions = 0;
  let totalCompletions = 0;
  let totalDistance = 0;
  let totalTime = 0;

  for (const event of events) {
    const yearKey = event.year ?? "unknown";
    const year = years.get(yearKey) ?? {
      year: event.year,
      label: event.year ?? unknownYearLabel,
      events: 0,
      missions: 0,
      completions: 0,
    };
    year.events += 1;
    year.missions += event.missionCount ?? 0;
    years.set(yearKey, year);

    const country = countries.get(event.country) ?? {
      country: event.country,
      code: event.countryCode,
      events: 0,
      missions: 0,
      completions: 0,
    };
    country.events += 1;
    country.missions += event.missionCount;
    countries.set(event.country, country);

    const region = regions.get(event.region);
    if (region) {
      region.events += 1;
      region.missions += event.missionCount;
    }

    if (Number.isFinite(event.missionCount)) {
      setSizes.set(event.missionCount, (setSizes.get(event.missionCount) ?? 0) + 1);
    }

    let eventRatingTotal = 0;
    let eventRatedMissions = 0;
    let eventCompletions = 0;

    for (const mission of event.missions) {
      missionCount += 1;
      if (!mission.offline) activeMissions += 1;
      if (mission.author) {
        const publisher = publishers.get(mission.author) ?? {
          author: mission.author,
          missions: 0,
          eventIds: new Set(),
          factions: new Map(),
        };
        const faction = normalizeFaction(mission.authorFaction);
        publisher.missions += 1;
        publisher.eventIds.add(event.id);
        if (faction !== "unknown") {
          publisher.factions.set(faction, (publisher.factions.get(faction) ?? 0) + 1);
        }
        publishers.set(mission.author, publisher);
      }

      if (typeof mission.rating === "number" && mission.rating > 0) {
        ratingTotal += mission.rating;
        ratedMissions += 1;
        eventRatingTotal += mission.rating;
        eventRatedMissions += 1;
        if (region) {
          region.ratings += mission.rating;
          region.rated += 1;
        }
      }

      const completions = mission.completions ?? 0;
      totalCompletions += completions;
      eventCompletions += completions;
      totalDistance += mission.distanceMeters ?? 0;
      totalTime += mission.timeMilliseconds ?? 0;
      year.completions += completions;
      country.completions += completions;
      if (region) region.completions += completions;

      missions.push({
        ...mission,
        eventId: event.id,
        city: event.city,
        country: event.country,
        countryCode: event.countryCode,
      });
    }

    if (eventRatedMissions > 0) {
      ratingEvents.push({
        id: event.id,
        title: event.title,
        city: event.city,
        country: event.country,
        countryCode: event.countryCode,
        missionCount: event.missionCount,
        ratedMissions: eventRatedMissions,
        rating: eventRatingTotal / eventRatedMissions,
        completions: eventCompletions,
      });
    }
  }

  const publisherRows = [...publishers.values()]
    .map((publisher) => ({
      author: publisher.author,
      missions: publisher.missions,
      events: publisher.eventIds.size,
      faction:
        [...publisher.factions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "unknown",
    }))
    .sort((a, b) => b.missions - a.missions || a.author.localeCompare(b.author));
  const factionMissions = publisherRows.reduce(
    (counts, publisher) => ({
      ...counts,
      [publisher.faction]: (counts[publisher.faction] ?? 0) + publisher.missions,
    }),
    { resistance: 0, enlightened: 0 },
  );
  const countryRows = [...countries.values()].sort(
    (a, b) => b.missions - a.missions || b.events - a.events,
  );
  const ratedMissionsList = missions.filter(
    (mission) => typeof mission.rating === "number" && mission.rating > 0,
  );
  const ratingHigh = (a, b) =>
    b.rating - a.rating || (b.completions ?? 0) - (a.completions ?? 0) ||
    String(a.title ?? a.city).localeCompare(String(b.title ?? b.city));
  const ratingLow = (a, b) =>
    a.rating - b.rating || (b.completions ?? 0) - (a.completions ?? 0) ||
    String(a.title ?? a.city).localeCompare(String(b.title ?? b.city));

  return {
    eventCount: events.length,
    missionCount,
    activeMissions,
    averageRating: ratedMissions ? ratingTotal / ratedMissions : 0,
    totalCompletions,
    totalDistance,
    totalTime,
    authorCount: publishers.size,
    publishers: publisherRows,
    factionMissions,
    publishedMissionCount: publisherRows.reduce(
      (total, publisher) => total + publisher.missions,
      0,
    ),
    years: [...years.values()].sort(
      (a, b) => (a.year ?? Number.POSITIVE_INFINITY) - (b.year ?? Number.POSITIVE_INFINITY),
    ),
    regions: [...regions.values()],
    countries: countryRows.slice(0, 10),
    allCountries: countryRows,
    topMissions: missions
      .filter((mission) => mission.completions > 0)
      .sort(
        (a, b) =>
          b.completions - a.completions || (b.rating ?? 0) - (a.rating ?? 0),
      )
      .slice(0, 10),
    topRatedEvents: [...ratingEvents].sort(ratingHigh).slice(0, 10),
    lowestRatedEvents: [...ratingEvents].sort(ratingLow).slice(0, 10),
    topRatedMissions: [...ratedMissionsList].sort(ratingHigh).slice(0, 10),
    lowestRatedMissions: [...ratedMissionsList].sort(ratingLow).slice(0, 10),
    setSizes: [...setSizes.entries()]
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => b.count - a.count || a.size - b.size)
      .slice(0, 6),
  };
}

export function buildPublisherSlices(stats) {
  return stats.publishers.map((publisher, index, allPublishers) => {
    const faction = PUBLISHER_COLORS[publisher.faction]
      ? publisher.faction
      : "unknown";
    const colorIndex = allPublishers
      .slice(0, index)
      .filter((candidate) => candidate.faction === publisher.faction).length;
    const colors = PUBLISHER_COLORS[faction];
    const percentage = stats.publishedMissionCount
      ? (publisher.missions / stats.publishedMissionCount) * 100
      : 0;
    const offset = allPublishers.slice(0, index).reduce(
      (total, candidate) =>
        total +
        (stats.publishedMissionCount
          ? (candidate.missions / stats.publishedMissionCount) * 100
          : 0),
      0,
    );
    return {
      ...publisher,
      color: colors[colorIndex % colors.length],
      percentage,
      dashPercentage: percentage > 0.5 ? percentage - 0.25 : percentage,
      offset,
    };
  });
}
