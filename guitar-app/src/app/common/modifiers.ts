// Common definition of all chord modifiers
export type ModifierOperation =
  | { type: 'add', interval: string }
  | { type: 'remove', intervals: string[] }
  | { type: 'replace', from: string[], to: string };

export type ModifierDefinition = {
  description: string;
  operations: ModifierOperation[];
  defines: {
    third?: 'major' | 'minor' | 'none';
    fifth?: 'perfect' | 'diminished' | 'augmented' | 'none';
    seventh?: 'major' | 'minor' | 'diminished' | 'none';
    ninth?: 'major' | 'minor' | 'augmented' | 'none';
    eleventh?: 'perfect' | 'augmented' | 'none';
    thirteenth?: 'major' | 'minor' | 'none';
  };
};

export const MODIFIER_DEFINITIONS: Record<string, ModifierDefinition> = {
  // Triad qualities
  'm': {
    description: 'Minor triad (♭3)',
    operations: [{ type: 'replace', from: ['3'], to: 'b3' }],
    defines: { third: 'minor' }
  },
  'dim': {
    description: 'Diminished triad (♭3, ♭5)',
    operations: [
      { type: 'replace', from: ['3'], to: 'b3' },
      { type: 'replace', from: ['5'], to: 'b5' }
    ],
    defines: { third: 'minor', fifth: 'diminished' }
  },
  'aug': {
    description: 'Augmented triad (♯5)',
    operations: [{ type: 'replace', from: ['5'], to: '#5' }],
    defines: { fifth: 'augmented' }
  },

  // Power chord and sixth
  '5': {
    description: 'Power chord (root + 5th only)',
    operations: [{ type: 'remove', intervals: ['3', 'b3'] }],
    defines: { third: 'none' }
  },
  '6': {
    description: 'Major 6th (add 6th)',
    operations: [{ type: 'add', interval: '6' }],
    defines: { thirteenth: 'major' }
  },

  // Sevenths
  '7': {
    description: 'Dominant 7th (♭7)',
    operations: [{ type: 'add', interval: 'b7' }],
    defines: { seventh: 'minor' }
  },
  'maj7': {
    description: 'Major 7th (♮7)',
    operations: [{ type: 'add', interval: '7' }],
    defines: { seventh: 'major' }
  },
  'ø7': {
    description: 'Half-diminished 7th (♭3, ♭5, ♭7)',
    operations: [
      { type: 'replace', from: ['3'], to: 'b3' },
      { type: 'replace', from: ['5'], to: 'b5' },
      { type: 'add', interval: 'b7' }
    ],
    defines: { third: 'minor', fifth: 'diminished', seventh: 'minor' }
  },
  'dim7': {
    description: 'Diminished 7th (♭3, ♭5, ♭♭7)',
    operations: [
      { type: 'replace', from: ['3'], to: 'b3' },
      { type: 'replace', from: ['5'], to: 'b5' },
      { type: 'add', interval: '6' } // ♭♭7 = 6
    ],
    defines: { third: 'minor', fifth: 'diminished', seventh: 'diminished' }
  },
  'aug7': {
    description: 'Augmented 7th (♯5, ♭7)',
    operations: [
      { type: 'replace', from: ['5'], to: '#5' },
      { type: 'add', interval: 'b7' }
    ],
    defines: { fifth: 'augmented', seventh: 'minor' }
  },

  // Extensions
  'maj9': {
    description: 'Major 9th (maj7 + 9)',
    operations: [
      { type: 'add', interval: '7' },
      { type: 'add', interval: '9' }
    ],
    defines: { seventh: 'major', ninth: 'major' }
  },
  'add9': {
    description: 'Add major 9th (2nd)',
    operations: [{ type: 'add', interval: '9' }],
    defines: { ninth: 'major' }
  },
  'add11': {
    description: 'Add perfect 11th (4th)',
    operations: [{ type: 'add', interval: '11' }],
    defines: { eleventh: 'perfect' }
  },
  'add13': {
    description: 'Add 13th (6th)',
    operations: [{ type: 'add', interval: '13' }],
    defines: { thirteenth: 'major' }
  },

  // Suspended
  'sus2': {
    description: 'Suspend 2nd (replace 3rd with 2nd)',
    operations: [{ type: 'replace', from: ['3', 'b3'], to: '2' }],
    defines: { third: 'none' }
  },
  'sus4': {
    description: 'Suspend 4th (replace 3rd with 4th)',
    operations: [{ type: 'replace', from: ['3', 'b3'], to: '4' }],
    defines: { third: 'none' }
  },

  // Altered 5ths
  'b5': {
    description: 'Flattened 5th (♭5)',
    operations: [{ type: 'replace', from: ['5'], to: 'b5' }],
    defines: { fifth: 'diminished' }
  },
  '#5': {
    description: 'Sharpened 5th (♯5)',
    operations: [{ type: 'replace', from: ['5'], to: '#5' }],
    defines: { fifth: 'augmented' }
  },
  'bb5': {
    description: 'Double-flattened 5th (♭♭5)',
    operations: [{ type: 'replace', from: ['5'], to: '4' }], // ♭♭5 = 4
    defines: { fifth: 'diminished' }
  },

  // Altered 9ths
  'b9': {
    description: 'Flattened 9th (♭9)',
    operations: [{ type: 'add', interval: 'b9' }],
    defines: { ninth: 'minor' }
  },
  '#9': {
    description: 'Sharpened 9th (♯9)',
    operations: [{ type: 'add', interval: '#9' }],
    defines: { ninth: 'augmented' }
  },

  // Altered 11th & 13th
  '#11': {
    description: 'Sharpened 11th (♯11)',
    operations: [{ type: 'add', interval: '#11' }],
    defines: { eleventh: 'augmented' }
  },
  'b13': {
    description: 'Flattened 13th (♭13)',
    operations: [{ type: 'add', interval: 'b13' }],
    defines: { thirteenth: 'minor' }
  },

  // Suppressions
  'no3': {
    description: 'Omit 3rd',
    operations: [{ type: 'remove', intervals: ['3', 'b3'] }],
    defines: { third: 'none' }
  },
  'no5': {
    description: 'Omit 5th',
    operations: [{ type: 'remove', intervals: ['5', 'b5', '#5'] }],
    defines: { fifth: 'none' }
  },
  'no7': {
    description: 'Omit 7th',
    operations: [{ type: 'remove', intervals: ['7', 'b7'] }],
    defines: { seventh: 'none' }
  },
};

export const MODIFIERS: Modifier[] = [
  // Triad qualities
  'm', 'dim', 'aug',
  // Power chord and sixth
  '5', '6',
  // Sevenths
  '7', 'maj7', 'ø7', 'dim7', 'aug7',
  // Extensions
  'maj9', 'add9', 'add11', 'add13',
  // Suspended
  'sus2', 'sus4',
  // Altered 5ths
  'b5', '#5', 'bb5',
  // Altered 9ths
  'b9', '#9',
  // Altered 11th & 13th
  '#11', 'b13',
  // Suppressions
  'no3', 'no5', 'no7'
];
export type Modifier = keyof typeof MODIFIER_DEFINITIONS;

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

export function isModifierSubset(modifier: Modifier, other: Modifier): boolean {
  const modifierDef = MODIFIER_DEFINITIONS[modifier];
  const otherDef = MODIFIER_DEFINITIONS[other];
  
  if (!modifierDef || !otherDef) {
    return false;
  }

  if (modifier === other) {
    return true; // A modifier is always a subset of itself
  }

  // Check if all operations of the modifier are contained in the other modifier
  for (const operation of modifierDef.operations) {
    const isOperationContained = otherDef.operations.some(otherOp => {
      if (operation.type !== otherOp.type) {
        return false;
      }

      switch (operation.type) {
        case 'add':
          return operation.interval === (otherOp as typeof operation).interval;
        case 'remove':
          return operation.intervals.every(interval => 
            (otherOp as typeof operation).intervals.includes(interval)
          );
        case 'replace':
          return operation.from.every(from => 
            (otherOp as typeof operation).from.includes(from)
          ) && operation.to === (otherOp as typeof operation).to;
        default:
          return false;
      }
    });

    if (!isOperationContained) {
      return false;
    }
  }

  // Check if all defined characteristics of the modifier match those in the other
  const modifierDefines = modifierDef.defines;
  const otherDefines = otherDef.defines;

  const characteristics: (keyof typeof modifierDefines)[] = [
    'third', 'fifth', 'seventh', 'ninth', 'eleventh', 'thirteenth'
  ];

  for (const characteristic of characteristics) {
    const modifierValue = modifierDefines[characteristic];
    const otherValue = otherDefines[characteristic];

    if (modifierValue && (!otherValue || modifierValue !== otherValue)) {
      return false;
    }
  }

  return true;
}

export function canAddModifier(existingModifiers: Modifier[], newModifier: Modifier): true | string {
  // Check if the new modifier conflicts with any existing modifiers
  const newDef = MODIFIER_DEFINITIONS[newModifier];
  if (!newDef) return `Unknown modifier: ${newModifier}`;

  for (const existingMod of existingModifiers) {
    if (existingMod === newModifier) continue; // Skip duplicates

    const existingDef = MODIFIER_DEFINITIONS[existingMod];
    if (!existingDef) continue;

    // Check for conflicts based on what each modifier defines
    const conflicts = detectConflicts(existingDef, newDef);
    if (conflicts.length > 0) {
      return `Conflict between "${existingMod}" and "${newModifier}": ${conflicts.join(', ')}`;
    }
  }

  return true;
}

function detectConflicts(
  existingDefinition: ModifierDefinition,
  incomingDefinition: ModifierDefinition
): string[] {
  const conflicts: string[] = [];

  const existing = existingDefinition.defines;
  const incoming = incomingDefinition.defines;

  // Local helper function to check for conflicts in a specific characteristic
  const checkCharacteristicConflict = (
    characteristic: keyof ModifierDefinition['defines'],
    intervalKey: string
  ): void => {
    const existingValue = existing[characteristic];
    const incomingValue = incoming[characteristic];

    if (existingValue && incomingValue) {
      if (existingValue !== incomingValue) {
        if (existingValue === 'none' || incomingValue === 'none') {
          conflicts.push(`${characteristic} conflict (one removes, other defines)`);
        } else {
          conflicts.push(`${characteristic} conflict`);
        }
      } else if (existingValue === 'none' && incomingValue === 'none') {
        // Special handling for 'none' values - check if they have conflicting replace operations
        const existingReplaceOp = existingDefinition.operations.find(
          op => op.type === 'replace' && op.from.includes(intervalKey)
        ) as { type: 'replace', from: string[], to: string } | undefined;
        
        const incomingReplaceOp = incomingDefinition.operations.find(
          op => op.type === 'replace' && op.from.includes(intervalKey)
        ) as { type: 'replace', from: string[], to: string } | undefined;

        if (existingReplaceOp || incomingReplaceOp) {
          if (existingReplaceOp && incomingReplaceOp) {
            if (existingReplaceOp.to !== incomingReplaceOp.to) {
              conflicts.push(`${characteristic} conflict (both replace ${intervalKey} with different notes)`);
            }
          } else {
            conflicts.push(`${characteristic} conflict (one replaces, other defines)`);
          }
        }
      }
    }
  };

  // Check each musical element for conflicts
  checkCharacteristicConflict('third', '3');
  checkCharacteristicConflict('fifth', '5');
  checkCharacteristicConflict('seventh', '7');
  checkCharacteristicConflict('ninth', '9');
  checkCharacteristicConflict('eleventh', '11');
  checkCharacteristicConflict('thirteenth', '13');

  return conflicts;
}

export function getModifierDescription(modifier: Modifier): string {
  return MODIFIER_DEFINITIONS[modifier]?.description ?? 'Unknown modifier';
}
