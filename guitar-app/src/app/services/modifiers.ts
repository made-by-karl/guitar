
export const MODIFIERS = [
  'm', '7', 'maj7', 'maj9', 'sus2', 'sus4', 'add9', 'add11', 'add13', 'ø7', 'dim7', 'dim', 'aug7', 'aug', 'b5', '#5', 'bb5', 'b9', '#9', '#11', 'b13', 'no3', 'no5', 'no7'
] as const;

export type Modifier = typeof MODIFIERS[number];

export function isModifier(modifier: string): modifier is Modifier {
  return MODIFIERS.includes(modifier as Modifier);
}

export function areModifiersValid(modifiers: Modifier[]): true | string[] {
  const conflicts: string[] = [];
  const seen: Set<Modifier> = new Set();

  for (const mod of modifiers) {
    if (seen.has(mod)) continue; // Skip duplicates
    seen.add(mod);

    const result = canAddModifier(Array.from(seen), mod);
    if (result !== true) {
      conflicts.push(result);
    }
  }

  return conflicts.length > 0 ? conflicts : true;
}

export function canAddModifier(existingModifiers: Modifier[], newModifier: Modifier): true | string {
  const conflicts: [Modifier, Modifier, string][] = [
    // Third clashes
    ['m', 'sus2', '“m” needs ♭3, “sus2” replaces 3 with 2'],
    ['m', 'sus4', '“m” needs ♭3, “sus4” replaces 3 with 4'],
    ['m', 'no3', '“m” needs ♭3, but “no3” removes the 3rd'],
    ['sus2', 'sus4', 'You cannot replace the 3rd with both 2 and 4'],

    // Seventh clashes
    ['7', 'maj7', '“7” uses ♭7, but “maj7” uses ♮7'],
    ['7', 'maj9', '“7” uses ♭7, but “maj9” implies ♮7'],
    ['7', 'dim7', '“7” uses ♭7, “dim7” uses ♭♭7'],
    ['7', 'ø7', '“7” is dominant, “ø7” is half-diminished'],
    ['7', 'aug7', '“7” uses perfect 5th, “aug7” uses ♯5'],

    ['maj7', 'dim7', '“maj7” uses ♮7, “dim7” uses ♭♭7'],
    ['maj7', 'ø7', '“maj7” uses ♮7, “ø7” uses ♭7'],
    ['maj7', 'aug7', '“maj7” uses ♮7, “aug7” uses ♭7'],
    ['maj9', 'dim7', '“maj9” uses ♮7, “dim7” uses ♭♭7'],
    ['maj9', 'ø7', '“maj9” uses ♮7, “ø7” uses ♭7'],
    ['maj9', 'aug7', '“maj9” uses ♮7, “aug7” uses ♭7'],

    ['ø7', 'dim7', '“ø7” uses ♭7, “dim7” uses ♭♭7'],
    ['ø7', 'aug7', '“ø7” uses ♭7, “aug7” uses ♯5'],
    ['dim7', 'aug7', '“dim7” uses ♭♭7 and ♭5, “aug7” uses ♭7 and ♯5'],

    ['7', 'no7', '“7” requires a 7th, but “no7” removes it'],
    ['maj7', 'no7', '“maj7” requires a 7th, but “no7” removes it'],
    ['maj9', 'no7', '“maj9” implies maj7, which conflicts with “no7”'],
    ['ø7', 'no7', '“ø7” includes a 7th, “no7” removes it'],
    ['dim7', 'no7', '“dim7” includes a 7th, “no7” removes it'],
    ['aug7', 'no7', '“aug7” includes a 7th, “no7” removes it'],

    // Fifth clashes
    ['b5', '#5', 'Cannot have both ♭5 and ♯5'],
    ['b5', 'bb5', 'Cannot have both ♭5 and ♭♭5'],
    ['#5', 'bb5', 'Cannot have both ♯5 and ♭♭5'],
    ['dim', 'aug', '“dim” has ♭5, “aug” has ♯5'],
    ['dim', '#5', '“dim” has ♭5, “#5” contradicts it'],
    ['dim', 'aug7', '“dim” has ♭5, “aug7” has ♯5'],
    ['aug', 'b5', '“aug” has ♯5, “b5” contradicts it'],
    ['aug', 'bb5', '“aug” has ♯5, “bb5” contradicts it'],
    ['aug', 'dim7', '“aug” has ♯5, “dim7” has ♭5'],
    ['aug', 'ø7', '“aug” has ♯5, “ø7” has ♭5'],
    ['dim', 'no5', '“dim” uses ♭5, “no5” removes the 5th'],
    ['aug', 'no5', '“aug” uses ♯5, “no5” removes the 5th'],
    ['b5', 'no5', '“b5” defines the 5th, “no5” removes it'],
    ['#5', 'no5', '“#5” defines the 5th, “no5” removes it'],
    ['bb5', 'no5', '“bb5” defines the 5th, “no5” removes it'],
    ['dim7', 'no5', '“dim7” defines the 5th, “no5” removes it'],
    ['ø7', 'no5', '“ø7” defines the 5th, “no5” removes it'],
    ['aug7', 'no5', '“aug7” defines the 5th, “no5” removes it'],

    // Ninth
    ['add9', 'b9', '“add9” adds natural 9, “b9” alters it'],
    ['add9', '#9', '“add9” adds natural 9, “#9” alters it'],
    ['maj9', 'b9', '“maj9” uses natural 9, “b9” contradicts it'],
    ['maj9', '#9', '“maj9” uses natural 9, “#9” contradicts it'],
    ['b9', '#9', 'Cannot have both ♭9 and ♯9'],

    // Eleventh
    ['add11', '#11', 'Cannot have both natural 11 and ♯11'],

    // Thirteenth
    ['add13', 'b13', 'Cannot have both natural 13 and ♭13'],
  ];

  for (const [a, b, reason] of conflicts) {
    if (
      (existingModifiers.includes(a) && newModifier === b) ||
      (existingModifiers.includes(b) && newModifier === a)
    ) {
      return reason;
    }
  }

  return true;
}

export function getModifierDescription(modifier: Modifier): string {
  const descriptions: Record<Modifier, string> = {
    // Triad qualities
    'm': 'Minor triad (♭3)',
    'dim': 'Diminished triad (♭3, ♭5)',
    'aug': 'Augmented triad (♯5)',

    // Sevenths
    '7': 'Dominant 7th (♭7)',
    'maj7': 'Major 7th (♮7)',
    'ø7': 'Half-diminished 7th (♭3, ♭5, ♭7)',
    'dim7': 'Diminished 7th (♭3, ♭5, ♭♭7)',
    'aug7': 'Augmented 7th (♯5, ♭7)',

    // Extensions
    'maj9': 'Major 9th (maj7 + 9)',
    'add9': 'Add major 9th (2nd)',
    'add11': 'Add perfect 11th (4th)',
    'add13': 'Add 13th (6th)',

    // Suspended
    'sus2': 'Suspend 2nd (replace 3rd with 2nd)',
    'sus4': 'Suspend 4th (replace 3rd with 4th)',

    // Altered 5ths
    'b5': 'Flattened 5th (♭5)',
    '#5': 'Sharpened 5th (♯5)',
    'bb5': 'Double-flattened 5th (♭♭5)',

    // Altered 9ths
    'b9': 'Flattened 9th (♭9)',
    '#9': 'Sharpened 9th (♯9)',

    // Altered 11th & 13th
    '#11': 'Sharpened 11th (♯11)',
    'b13': 'Flattened 13th (♭13)',

    // Suppressions
    'no3': 'Omit 3rd',
    'no5': 'Omit 5th',
    'no7': 'Omit 7th',
  };

  return descriptions[modifier] ?? 'Unknown modifier';
}
