/** Exact ages allowed for each traveller age group (booking form + server rules + database CHECK). */
export const AGE_RANGES = { adult: { min: 18, max: 59 }, senior: { min: 60, max: 110 } } as const;
