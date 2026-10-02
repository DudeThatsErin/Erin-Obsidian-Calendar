import type { Moment } from "moment";

import type { ICalendarSource, IDayMetadata } from "./types";

type MetadataProvider = (date: Moment) => Promise<IDayMetadata>;

const emptyMetadata: Required<IDayMetadata> = {
  classes: [],
  dataAttributes: {},
  dots: [],
};

async function combineMetadata(
  providers: MetadataProvider[],
  date: Moment
): Promise<IDayMetadata> {
  const metadata = await Promise.all(providers.map((provider) => provider(date)));

  return metadata.reduce<Required<IDayMetadata>>(
    (combined, entry) => ({
      classes: [...combined.classes, ...(entry.classes || [])],
      dataAttributes: Object.assign(combined.dataAttributes, entry.dataAttributes),
      dots: [...combined.dots, ...(entry.dots || [])],
    }),
    { ...emptyMetadata, dataAttributes: {} }
  );
}

export function getDailyMetadata(
  sources: ICalendarSource[],
  date: Moment
): Promise<IDayMetadata> {
  const providers: MetadataProvider[] = [];
  sources.forEach((source) => {
    if (source.getDailyMetadata) {
      providers.push(source.getDailyMetadata);
    }
  });

  return combineMetadata(
    providers,
    date
  );
}

export function getWeeklyMetadata(
  sources: ICalendarSource[],
  date: Moment
): Promise<IDayMetadata> {
  const providers: MetadataProvider[] = [];
  sources.forEach((source) => {
    if (source.getWeeklyMetadata) {
      providers.push(source.getWeeklyMetadata);
    }
  });

  return combineMetadata(
    providers,
    date
  );
}
