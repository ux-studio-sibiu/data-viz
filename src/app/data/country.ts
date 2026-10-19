// The shape of public/data/countries.json, written by scripts/build-boundaries.mjs (lesson 02).
// Types only: TypeScript can't check a JSON file fetched at runtime, so these describe what the script promises to write.

export type IncomeGroup = 'high' | 'upper-middle' | 'lower-middle' | 'low';

export type Country = {
  id: string;              // ISO 3166-1 alpha-3 ('FRA'). The join key between geometry and every dataset.
  iso2: string | null;     // 'FR'. Kosovo has the user-assigned 'XK'; null for the other 3 areas without an ISO code.
  hasIsoCode: boolean;     // false: Kosovo (XKX), N. Cyprus (CYN), Siachen Glacier (KAS), Somaliland (SOL)
  name: string;            // short display name ('Bosnia and Herz.')
  longName: string;        // full name ('Bosnia and Herzegovina')
  sovereign: string | null; // id of the governing state for dependencies ('GRL' → 'DNK')
  continent: string;
  subregion: string;
  incomeGroup: IncomeGroup | null; // Natural Earth's (dated) World Bank classification
  label: [lon: number, lat: number];
};

export type CountriesFile = {
  source: string;
  version: string;
  url: string;
  license: string;
  countries: Country[];
};
