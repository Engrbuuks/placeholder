// Registry of niche packs. To add a niche, write its JSON file in this folder and list it here.
import realEstate from "./real_estate.json";
import clinic from "./clinic.json";
import dental from "./dental.json";
import general from "./general.json";

export const packFiles: unknown[] = [realEstate, clinic, dental, general];

// The pack used when nothing else matches. It must exist in the list above.
export const fallbackPackId = "general";
