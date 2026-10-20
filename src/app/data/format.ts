// Number formats shared by every view, so the same figure reads the same everywhere.

// 3 significant digits: 4.07, 270, 23.5, 12,300. As precise as the data deserves, and no more.
export const figure = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 });
// Money, compact: $18.9K, $132K
export const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 });
// Head counts, compact: 2.89M, 1.43B
export const people = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 });
