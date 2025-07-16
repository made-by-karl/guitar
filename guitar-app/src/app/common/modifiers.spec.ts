import { TestBed } from '@angular/core/testing';

import {
    MODIFIER_DEFINITIONS,
    MODIFIERS,
    Modifier,
    isModifier,
    areModifiersValid,
    canAddModifier,
    getModifierDescription,
    isModifierSubset
} from './modifiers';

describe('Modifiers', () => {
    beforeEach(() => {
        TestBed.configureTestingModule({});
    });

    describe('MODIFIER_DEFINITIONS', () => {
        it('should contain all expected modifier definitions', () => {
            expect(MODIFIER_DEFINITIONS).toBeDefined();

            // Check that it contains key modifier types
            expect(MODIFIER_DEFINITIONS['m']).toBeDefined();
            expect(MODIFIER_DEFINITIONS['7']).toBeDefined();
            expect(MODIFIER_DEFINITIONS['maj7']).toBeDefined();
            expect(MODIFIER_DEFINITIONS['dim']).toBeDefined();
            expect(MODIFIER_DEFINITIONS['aug']).toBeDefined();
            expect(MODIFIER_DEFINITIONS['sus2']).toBeDefined();
            expect(MODIFIER_DEFINITIONS['sus4']).toBeDefined();
        });

        it('should have consistent structure for all definitions', () => {
            Object.entries(MODIFIER_DEFINITIONS).forEach(([key, definition]) => {
                expect(definition).toHaveProperty('description');
                expect(definition).toHaveProperty('operations');
                expect(definition).toHaveProperty('defines');
                expect(typeof definition.description).toBe('string');
                expect(Array.isArray(definition.operations)).toBe(true);
                expect(typeof definition.defines).toBe('object');
            });
        });

        it('should have valid operation types', () => {
            Object.entries(MODIFIER_DEFINITIONS).forEach(([key, definition]) => {
                definition.operations.forEach(operation => {
                    expect(['add', 'remove', 'replace']).toContain(operation.type);

                    if (operation.type === 'add') {
                        expect(operation).toHaveProperty('interval');
                        expect(typeof operation.interval).toBe('string');
                    } else if (operation.type === 'remove') {
                        expect(operation).toHaveProperty('intervals');
                        expect(Array.isArray(operation.intervals)).toBe(true);
                    } else if (operation.type === 'replace') {
                        expect(operation).toHaveProperty('from');
                        expect(operation).toHaveProperty('to');
                        expect(Array.isArray(operation.from)).toBe(true);
                        expect(typeof operation.to).toBe('string');
                    }
                });
            });
        });
    });

    describe('MODIFIERS array', () => {
        it('should contain all modifier keys from MODIFIER_DEFINITIONS', () => {
            const definitionKeys = Object.keys(MODIFIER_DEFINITIONS).sort();
            const modifiersArray = MODIFIERS.sort();
            expect(modifiersArray).toEqual(definitionKeys);
        });

        it('should contain expected modifier strings', () => {
            expect(MODIFIERS).toContain('m');
            expect(MODIFIERS).toContain('7');
            expect(MODIFIERS).toContain('maj7');
            expect(MODIFIERS).toContain('dim');
            expect(MODIFIERS).toContain('aug');
            expect(MODIFIERS).toContain('sus2');
            expect(MODIFIERS).toContain('sus4');
            expect(MODIFIERS).toContain('add9');
            expect(MODIFIERS).toContain('#5');
            expect(MODIFIERS).toContain('b5');
        });
    });

    describe('isModifier', () => {
        it('should return true for valid modifiers', () => {
            expect(isModifier('m')).toBe(true);
            expect(isModifier('7')).toBe(true);
            expect(isModifier('maj7')).toBe(true);
            expect(isModifier('dim')).toBe(true);
            expect(isModifier('aug')).toBe(true);
            expect(isModifier('sus2')).toBe(true);
            expect(isModifier('sus4')).toBe(true);
            expect(isModifier('add9')).toBe(true);
            expect(isModifier('#5')).toBe(true);
            expect(isModifier('b5')).toBe(true);
            expect(isModifier('no3')).toBe(true);
        });

        it('should return false for invalid modifiers', () => {
            expect(isModifier('invalid')).toBe(false);
            expect(isModifier('xyz')).toBe(false);
            expect(isModifier('13')).toBe(false); // Not in our definitions
            expect(isModifier('')).toBe(false);
            expect(isModifier('M')).toBe(false); // Case sensitive
        });

        it('should return false for non-string inputs', () => {
            expect(isModifier(null as any)).toBe(false);
            expect(isModifier(undefined as any)).toBe(false);
            expect(isModifier(123 as any)).toBe(false);
            expect(isModifier({} as any)).toBe(false);
        });
    });

    describe('getModifierDescription', () => {
        it('should return correct descriptions for valid modifiers', () => {
            expect(getModifierDescription('m')).toBe('Minor triad (♭3)');
            expect(getModifierDescription('maj7')).toBe('Major 7th (♮7)');
            expect(getModifierDescription('7')).toBe('Dominant 7th (♭7)');
            expect(getModifierDescription('dim')).toBe('Diminished triad (♭3, ♭5)');
            expect(getModifierDescription('aug')).toBe('Augmented triad (♯5)');
            expect(getModifierDescription('sus2')).toBe('Suspend 2nd (replace 3rd with 2nd)');
            expect(getModifierDescription('sus4')).toBe('Suspend 4th (replace 3rd with 4th)');
        });

        it('should return "Unknown modifier" for invalid modifiers', () => {
            expect(getModifierDescription('invalid' as Modifier)).toBe('Unknown modifier');
            expect(getModifierDescription('xyz' as Modifier)).toBe('Unknown modifier');
        });

        it('should handle all defined modifiers', () => {
            // Test that every modifier in MODIFIER_DEFINITIONS has a description
            Object.keys(MODIFIER_DEFINITIONS).forEach(modifier => {
                const description = getModifierDescription(modifier as Modifier);
                expect(description).not.toBe('Unknown modifier');
                expect(description).toBe(MODIFIER_DEFINITIONS[modifier].description);
            });
        });
    });

    describe('canAddModifier', () => {
        describe('valid combinations', () => {
            it('should allow compatible modifiers', () => {
                expect(canAddModifier([], 'm')).toBe(true);
                expect(canAddModifier(['m'], '7')).toBe(true);
                expect(canAddModifier(['7'], 'b9')).toBe(true);
                expect(canAddModifier(['maj7'], 'add9')).toBe(true);
                expect(canAddModifier(['add9'], '#11')).toBe(true);
            });

            it('should allow same modifier (duplicates)', () => {
                expect(canAddModifier(['m'], 'm')).toBe(true);
                expect(canAddModifier(['7'], '7')).toBe(true);
            });

            it('should allow modifiers that don\'t conflict on different elements', () => {
                expect(canAddModifier(['m'], 'add9')).toBe(true); // third vs ninth
                expect(canAddModifier(['7'], '#11')).toBe(true); // seventh vs eleventh
                expect(canAddModifier(['add13'], 'b5')).toBe(true); // thirteenth vs fifth
            });
        });

        describe('conflicting combinations', () => {
            it('should detect third conflicts', () => {
                const result1 = canAddModifier(['m'], 'sus2');
                expect(result1).not.toBe(true);
                expect(result1).toContain('third conflict');

                const result2 = canAddModifier(['m'], 'sus4');
                expect(result2).not.toBe(true);
                expect(result2).toContain('third conflict');

                const result3 = canAddModifier(['sus2'], 'sus4');
                expect(result3).not.toBe(true);
                expect(result3).toContain('third conflict');

                const result4 = canAddModifier(['m'], 'no3');
                expect(result4).not.toBe(true);
                expect(result4).toContain('third conflict');
            });

            it('should detect fifth conflicts', () => {
                const result1 = canAddModifier(['dim'], 'aug');
                expect(result1).not.toBe(true);
                expect(result1).toContain('fifth conflict');

                const result2 = canAddModifier(['b5'], '#5');
                expect(result2).not.toBe(true);
                expect(result2).toContain('fifth conflict');

                const result3 = canAddModifier(['aug'], 'no5');
                expect(result3).not.toBe(true);
                expect(result3).toContain('fifth conflict');

                const result4 = canAddModifier(['dim'], 'no5');
                expect(result4).not.toBe(true);
                expect(result4).toContain('fifth conflict');
            });

            it('should detect seventh conflicts', () => {
                const result1 = canAddModifier(['7'], 'maj7');
                expect(result1).not.toBe(true);
                expect(result1).toContain('seventh conflict');

                const result2 = canAddModifier(['maj7'], 'dim7');
                expect(result2).not.toBe(true);
                expect(result2).toContain('seventh conflict');

                const result3 = canAddModifier(['7'], 'no7');
                expect(result3).not.toBe(true);
                expect(result3).toContain('seventh conflict');

                const result4 = canAddModifier(['maj9'], 'no7');
                expect(result4).not.toBe(true);
                expect(result4).toContain('seventh conflict');
            });

            it('should detect ninth conflicts', () => {
                const result1 = canAddModifier(['add9'], 'b9');
                expect(result1).not.toBe(true);
                expect(result1).toContain('ninth conflict');

                const result2 = canAddModifier(['add9'], '#9');
                expect(result2).not.toBe(true);
                expect(result2).toContain('ninth conflict');

                const result3 = canAddModifier(['b9'], '#9');
                expect(result3).not.toBe(true);
                expect(result3).toContain('ninth conflict');

                const result4 = canAddModifier(['maj9'], 'b9');
                expect(result4).not.toBe(true);
                expect(result4).toContain('ninth conflict');
            });

            it('should detect eleventh conflicts', () => {
                const result = canAddModifier(['add11'], '#11');
                expect(result).not.toBe(true);
                expect(result).toContain('eleventh conflict');
            });

            it('should detect thirteenth conflicts', () => {
                const result = canAddModifier(['add13'], 'b13');
                expect(result).not.toBe(true);
                expect(result).toContain('thirteenth conflict');
            });
        });

        describe('complex combinations', () => {
            it('should handle multiple existing modifiers', () => {
                expect(canAddModifier(['m', '7'], 'b9')).toBe(true);
                expect(canAddModifier(['m', '7'], 'maj7')).not.toBe(true);
                expect(canAddModifier(['dim', 'no7'], 'add9')).toBe(true);
            });

            it('should detect conflicts in any position', () => {
                const result1 = canAddModifier(['add9', 'm'], 'b9');
                expect(result1).not.toBe(true);

                const result2 = canAddModifier(['7', 'add11'], 'maj7');
                expect(result2).not.toBe(true);
            });
        });

        it('should return error message for unknown modifiers', () => {
            const result = canAddModifier([], 'unknown' as Modifier);
            expect(result).toContain('Unknown modifier');
        });
    });

    describe('areModifiersValid', () => {
        it('should return true for valid modifier combinations', () => {
            expect(areModifiersValid([])).toBe(true);
            expect(areModifiersValid(['m'])).toBe(true);
            expect(areModifiersValid(['m', '7'])).toBe(true);
            expect(areModifiersValid(['maj7', 'add9'])).toBe(true);
            expect(areModifiersValid(['dim', 'add13'])).toBe(true);
        });

        it('should return conflict messages for invalid combinations', () => {
            const result1 = areModifiersValid(['m', 'sus2']);
            expect(Array.isArray(result1)).toBe(true);
            if (Array.isArray(result1)) {
                expect(result1.length).toBeGreaterThan(0);
                expect(result1[0]).toContain('third conflict');
            }

            const result2 = areModifiersValid(['7', 'maj7']);
            expect(Array.isArray(result2)).toBe(true);
            if (Array.isArray(result2)) {
                expect(result2.length).toBeGreaterThan(0);
                expect(result2[0]).toContain('seventh conflict');
            }
        });

        it('should handle multiple conflicts', () => {
            const result = areModifiersValid(['m', 'sus2', '7', 'maj7']);
            expect(Array.isArray(result)).toBe(true);
            if (Array.isArray(result)) {
                expect(result.length).toBeGreaterThan(1);
            }
        });

        it('should skip duplicate modifiers', () => {
            expect(areModifiersValid(['m', 'm', 'm'])).toBe(true);
            expect(areModifiersValid(['7', '7', 'add9'])).toBe(true);
        });

        it('should handle empty array', () => {
            expect(areModifiersValid([])).toBe(true);
        });
    });

    describe('Integration tests', () => {
        it('should have consistent behavior between functions', () => {
            // If canAddModifier says two modifiers conflict, areModifiersValid should agree
            const conflictingPairs = [
                ['m', 'sus2'],
                ['7', 'maj7'],
                ['add9', 'b9'],
                ['dim', 'aug'],
                ['b5', '#5']
            ];

            conflictingPairs.forEach(([mod1, mod2]) => {
                const canAdd = canAddModifier([mod1 as Modifier], mod2 as Modifier);
                const areValid = areModifiersValid([mod1 as Modifier, mod2 as Modifier]);

                expect(canAdd).not.toBe(true);
                expect(areValid).not.toBe(true);
            });
        });

        it('should provide informative error messages', () => {
            const result = canAddModifier(['maj7'], '7');
            expect(typeof result).toBe('string');
            expect(result).toContain('maj7');
            expect(result).toContain('7');
            expect(result).toContain('Conflict');
        });

        it('should handle all defined modifiers without errors', () => {
            // Test that every modifier can be processed without throwing errors
            Object.keys(MODIFIER_DEFINITIONS).forEach(modifier => {
                expect(() => {
                    isModifier(modifier);
                    getModifierDescription(modifier as Modifier);
                    canAddModifier([], modifier as Modifier);
                    areModifiersValid([modifier as Modifier]);
                }).not.toThrow();
            });
        });
    });

    describe('isSubsetOf', () => {
        describe('basic subset relationships', () => {
            it('should return true when modifier is a subset of another', () => {
                // m (minor 3rd) is a subset of dim (minor 3rd + diminished 5th)
                expect(isModifierSubset('m', 'dim')).toBe(true);
                
                // m (minor 3rd) is a subset of ø7 (minor 3rd + diminished 5th + minor 7th)
                expect(isModifierSubset('m', 'ø7')).toBe(true);
                
                // dim (minor 3rd + diminished 5th) is a subset of ø7 (minor 3rd + diminished 5th + minor 7th)
                expect(isModifierSubset('dim', 'ø7')).toBe(true);
                
                // dim (minor 3rd + diminished 5th) is a subset of dim7 (minor 3rd + diminished 5th + diminished 7th)
                expect(isModifierSubset('dim', 'dim7')).toBe(true);
            });

            it('should return false when modifier is not a subset', () => {
                // dim is not a subset of m (has additional operations)
                expect(isModifierSubset('dim', 'm')).toBe(false);
                
                // aug is not a subset of m (different fifth quality)
                expect(isModifierSubset('aug', 'm')).toBe(false);
                
                // maj7 is not a subset of 7 (different seventh quality)
                expect(isModifierSubset('maj7', '7')).toBe(false);
                
                // sus2 is not a subset of sus4 (different replacement)
                expect(isModifierSubset('sus2', 'sus4')).toBe(false);
            });

            it('should return true for identical modifiers', () => {
                expect(isModifierSubset('m', 'm')).toBe(true);
                expect(isModifierSubset('7', '7')).toBe(true);
                expect(isModifierSubset('dim', 'dim')).toBe(true);
                expect(isModifierSubset('sus2', 'sus2')).toBe(true);
            });
        });

        describe('complex subset relationships', () => {
            it('should handle seventh chord relationships', () => {
                // 7 (minor 7th) should be subset of ø7 when combined with minor third
                expect(isModifierSubset('7', 'aug7')).toBe(true); // Both have minor 7th
                
                // maj7 should not be subset of 7 (different seventh quality)
                expect(isModifierSubset('maj7', '7')).toBe(false);
            });

            it('should handle altered fifth relationships', () => {
                // b5 is a subset of dim (both have diminished fifth, even though dim also changes third)
                expect(isModifierSubset('b5', 'dim')).toBe(true); // b5 operation is contained in dim
                
                // #5 should be subset of aug (both have augmented fifth)
                expect(isModifierSubset('#5', 'aug')).toBe(true);
            });

            it('should handle suspension relationships', () => {
                // Both sus2 and sus4 remove the third, but replace with different notes
                expect(isModifierSubset('no3', 'sus2')).toBe(false); // no3 only removes, sus2 also replaces
                expect(isModifierSubset('no3', 'sus4')).toBe(false); // no3 only removes, sus4 also replaces
                expect(isModifierSubset('no3', '5')).toBe(true); // Both remove the third
            });

            it('should handle extension relationships', () => {
                // add9 should be subset of maj9 (maj9 includes both 7th and 9th)
                expect(isModifierSubset('add9', 'maj9')).toBe(true);
                
                // maj7 should be subset of maj9 (maj9 includes both 7th and 9th)
                expect(isModifierSubset('maj7', 'maj9')).toBe(true);
            });
        });

        describe('power chord and sixth relationships', () => {
            it('should handle power chord relationships', () => {
                // 5 (power chord) removes third, so no3 should be subset
                expect(isModifierSubset('no3', '5')).toBe(true);
                
                // 5 should not be subset of regular chords that have thirds
                expect(isModifierSubset('5', 'm')).toBe(false);
                expect(isModifierSubset('5', '7')).toBe(false);
            });

            it('should handle sixth chord relationships', () => {
                // 6 adds interval '6' and add13 adds interval '13' - they're different intervals
                // even though they're enharmonically equivalent in music theory
                expect(isModifierSubset('6', 'add13')).toBe(false); // Different interval names: '6' vs '13'
                expect(isModifierSubset('add13', '6')).toBe(false); // Different interval names: '13' vs '6'
            });
        });

        describe('error handling', () => {
            it('should return false for invalid modifiers', () => {
                expect(isModifierSubset('invalid' as Modifier, 'm')).toBe(false);
                expect(isModifierSubset('m', 'invalid' as Modifier)).toBe(false);
                expect(isModifierSubset('invalid' as Modifier, 'invalid' as Modifier)).toBe(false);
            });

            it('should handle undefined modifiers gracefully', () => {
                expect(isModifierSubset('' as Modifier, 'm')).toBe(false);
                expect(isModifierSubset('m', '' as Modifier)).toBe(false);
            });
        });

        describe('removal operation relationships', () => {
            it('should handle omit modifier relationships', () => {
                // no3 removes both 3 and b3, so it should be subset of 5 (which also removes them)
                expect(isModifierSubset('no3', '5')).toBe(true);
                
                // no5 removes various fifths
                expect(isModifierSubset('no5', 'no5')).toBe(true);
                
                // no7 removes sevenths
                expect(isModifierSubset('no7', 'no7')).toBe(true);
            });
        });
    });

    describe('Edge cases', () => {
        it('should handle special characters in modifier names', () => {
            expect(isModifier('#5')).toBe(true);
            expect(isModifier('b5')).toBe(true);
            expect(isModifier('ø7')).toBe(true);
            expect(isModifier('#9')).toBe(true);
            expect(isModifier('bb5')).toBe(true);
        });

        it('should be case sensitive', () => {
            expect(isModifier('M')).toBe(false); // Should be 'm'
            expect(isModifier('DIM')).toBe(false); // Should be 'dim'
            expect(isModifier('MAJ7')).toBe(false); // Should be 'maj7'
        });

        it('should handle empty modifier arrays', () => {
            expect(canAddModifier([], 'm')).toBe(true);
            expect(areModifiersValid([])).toBe(true);
        });
    });
});
