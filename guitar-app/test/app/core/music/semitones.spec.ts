import { getNoteMidi, note } from '@/app/core/music/semitones';

describe('semitones', () => {
  describe('getNoteMidi', () => {
    it('should map common guitar register notes to expected MIDI numbers', () => {
      expect(getNoteMidi(note('A', 2))).toBe(45);
      expect(getNoteMidi(note('E', 3))).toBe(52);
      expect(getNoteMidi(note('C', 4))).toBe(60);
    });
  });
});
