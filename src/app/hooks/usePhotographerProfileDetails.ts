export type PhotographerProfileDetails = {
  workLocations: string[];
  experienceYears: string | null;
  equipment: string;
  languages: string[];
  workModel: "solo" | "team" | null;
  specialtyTags: string[];
  experienceDetail: string;
  bio: string;
  selectedStyles: string[];
};

const STORAGE_PREFIX = "memento:photographer-profile:";

function storageKey(profileId: string) {
  return `${STORAGE_PREFIX}${profileId}`;
}

export function loadPhotographerProfileDetails(profileId: string): PhotographerProfileDetails | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) return null;
    return JSON.parse(raw) as PhotographerProfileDetails;
  } catch {
    return null;
  }
}

export function savePhotographerProfileDetails(
  profileId: string,
  details: PhotographerProfileDetails,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(profileId), JSON.stringify(details));
}
