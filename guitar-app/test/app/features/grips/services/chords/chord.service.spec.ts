import { TestBed } from '@angular/core/testing';

import { ChordService } from '@/app/features/grips/services/chords/chord.service';

describe('ChordService', () => {
    let service: ChordService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(ChordService);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it.each([
        {
            input: "Cmmaj7bb5",
            expected: {
                root: "C",
                bass: undefined,
                modifiers: ["m", "maj7", "bb5"],
                notes: ["C", "D#", "B", "F"]
            }
        },
        {
            input: "Cmaj7sus2/F",
            expected: {
                root: "C",
                bass: "F",
                modifiers: ["maj7", "sus2"],
                notes: ["F", "C", "G", "B", "D"]
            }
        },
        {
            input: "Bbdim/D",
            expected: {
                root: "A#",
                bass: "D",
                modifiers: ["dim"],
                notes: ["D", "A#", "C#", "E"]
            }
        },
        {
            input: "Dø7/G",
            expected: {
                root: "D",
                bass: "G",
                modifiers: ["ø7"],
                notes: ["G", "D", "F", "G#", "C"]
            }
        },
        {
            input: "C+add9no3",
            expected: {
                root: "C",
                bass: undefined,
                modifiers: ["aug", "add9", "no3"],
                notes: ["C", "G#", "D"]
            }
        },
        {
            input: "C9",
            expected: {
                root: "C",
                bass: undefined,
                modifiers: ["9"],
                notes: ["C", "E", "G", "A#", "D"]
            }
        },
        {
            input: "Cm9",
            expected: {
                root: "C",
                bass: undefined,
                modifiers: ["m", "9"],
                notes: ["C", "G", "D#", "A#", "D"]
            }
        },
        {
            input: "C6/9",
            expected: {
                root: "C",
                bass: undefined,
                modifiers: ["6/9"],
                notes: ["C", "E", "G", "A", "D"]
            }
        },
        {
            input: "C6/9/E",
            expected: {
                root: "C",
                bass: "E",
                modifiers: ["6/9"],
                notes: ["C", "E", "G", "A", "D"]
            }
        }
    ])('should analyze chord $input correctly', ({ input, expected }) => {
        expect(service.calculateNotes(input)).toEqual(expected);
    });

    describe('Basic major chords', () => {
        it.each([
            {
                input: "C",
                expected: {
                    root: "C",
                    bass: undefined,
                    modifiers: [],
                    notes: ["C", "E", "G"]
                }
            },
            {
                input: "F",
                expected: {
                    root: "F",
                    bass: undefined,
                    modifiers: [],
                    notes: ["F", "A", "C"]
                }
            },
            {
                input: "G/B",
                expected: {
                    root: "G",
                    bass: "B",
                    modifiers: [],
                    notes: ["G", "B", "D"]
                }
            }
        ])('should create correct notes for basic major chord %s', ({ input, expected }) => {
            const result = service.calculateNotes(input);
            expect(result).toEqual(expected);
            // Should always include root, third, and fifth
            if (!input.includes('/')) {  // Not a slash chord
                const [root, third, fifth] = result.notes;
                expect(root).toBe(expected.root);
                expect(result.notes).toHaveLength(3);
                expect(new Set(result.notes)).toEqual(new Set(expected.notes));
            }
        });

        it('should create major triad when no modifiers present', () => {
            const { notes } = service.calculateNotes({ root: 'C', modifiers: [] });
            expect(notes).toEqual(['C', 'E', 'G']);
        });
    });

    describe('numeric extension parsing', () => {
        it('parses 6/9 as a modifier rather than a slash bass', () => {
            const chord = service.parseChord('C6/9');
            expect(chord).toEqual({ root: 'C', modifiers: ['6/9'], bass: undefined });
        });

        it('parses a slash bass after a 6/9 modifier', () => {
            const chord = service.parseChord('C6/9/E');
            expect(chord).toEqual({ root: 'C', modifiers: ['6/9'], bass: 'E' });
        });

        it('throws when a slash suffix is not a note name', () => {
            expect(() => service.parseChord('C/9')).toThrow('Invalid slash chord bass note');
        });
    });
});
