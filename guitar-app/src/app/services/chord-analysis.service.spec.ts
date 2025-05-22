import { TestBed } from '@angular/core/testing';

import { ChordAnalysisService } from './chord-analysis.service';

describe('ChordAnalysisService', () => {
    let service: ChordAnalysisService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(ChordAnalysisService);
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
            input: "Cmaj7sus2sus4/F",
            expected: {
                root: "C",
                bass: "F",
                modifiers: ["maj7", "sus2", "sus4"],
                notes: ["C", "B", "D", "G", "F"]
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
            input: "Dø7no5/G",
            expected: {
                root: "D",
                bass: "G",
                modifiers: ["ø7", "no5"],
                notes: ["G", "D", "F", "C"]
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
        }
    ])('should analyze chord $input correctly', ({ input, expected }) => {
        expect(service.parseChord(input)).toEqual(expected);
    });
})