import {
  PlayingAction,
  PlayingPattern,
  RelativeStringRole,
  StrumDirection,
  StrumRange
} from '@/app/features/patterns/services/playing-patterns.model';

export function createDefaultPlayingPatterns(now: number = Date.now()): PlayingPattern[] {
  // use id: 'default-<short-name-slug>'
  return [
    {
      id: 'default-basic-pop-backbeat',
      name: 'Basic Pop Backbeat',
      description: 'Steady acoustic pop groove for open-chord verses and choruses that need a clear backbeat without getting busy.',
      category: 'Campfire',
      suggestedGenre: 'Acoustic Pop',
      exampleSong: 'Zombie',
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('bass', 'top'), ['accent'])],
          [4, strum('D', range('bass', 'top'))],
          [6, strum('U', range('top', 'middle'))],
          [8, strum('D', range('bass', 'top'), ['accent'])],
          [12, strum('D', range('bass', 'top'))],
          [14, strum('U', range('top', 'middle'))]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-indie-push-groove',
      name: 'Indie Push Groove',
      description: 'Syncopated acoustic groove with a lifted upstroke feel for indie folk-pop choruses and driving singalongs.',
      category: 'Campfire',
      suggestedGenre: 'Indie Folk-Pop',
      exampleSong: 'Ho Hey',
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('bass', 'top'))],
          [4, strum('D', range('second-from-bass', 'second-from-top'), ['mute'])],
          [7, strum('U', range('top', 'middle'), ['accent'])],
          [10, strum('U', range('top', 'middle'))],
          [12, strum('D', range('bass', 'top'), ['accent'])],
          [14, strum('U', range('top', 'middle'))]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-folk-strum',
      name: 'Folk Strum (D-D-U-U-D-U)',
      description: 'Classic campfire strum for singer-songwriter, folk, and familiar acoustic covers with an easy singalong pulse.',
      category: 'Campfire',
      suggestedGenre: 'Folk Singalong',
      exampleSong: 'Leaving on a Jet Plane',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          strum('D', range('bass', 'top')),
          null,
          strum('D', range('bass', 'top')),
          strum('U', range('top', 'middle')),
          strum('U', range('top', 'middle')),
          strum('D', range('bass', 'top')),
          strum('U', range('top', 'middle'))
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-acoustic-pop-mute-groove',
      name: 'Acoustic Pop Mute Groove',
      description: 'Modern muted acoustic groove with light percussion accents for rhythmic pop arrangements around the campfire.',
      category: 'Campfire',
      suggestedGenre: 'Modern Acoustic Pop',
      exampleSong: 'Riptide',
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('bass', 'top'), ['accent'])],
          [4, strum('D', range('second-from-bass', 'second-from-top'), ['mute'])],
          [8, percussive('body-knock')],
          [10, strum('U', range('top', 'middle'))],
          [12, strum('D', range('bass', 'top'))],
          [14, strum('U', range('top', 'middle'), ['mute'])]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-country-boom-chick',
      name: 'Country Boom-Chick',
      description: 'Alternating bass-and-brush country pattern that keeps open chords moving in roots, Americana, and campfire standards.',
      category: 'Campfire',
      suggestedGenre: 'Country Roots',
      exampleSong: 'Folsom Prison Blues',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          relativePick('bass'),
          strum('D', range('middle', 'top'), ['accent']),
          relativePick('second-from-bass'),
          strum('D', range('middle', 'top')),
          relativePick('bass'),
          strum('D', range('middle', 'top'), ['accent']),
          relativePick('second-from-bass'),
          strum('U', range('top', 'middle'))
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-waltz-3-4',
      name: 'Waltz 3/4',
      description: 'Beat-one bass with lighter upper-string brushes for waltzes, hymns, and slower campfire songs in three.',
      category: 'Campfire',
      suggestedGenre: 'Waltz / Folk Hymn',
      exampleSong: 'Amazing Grace',
      measures: [{
        timeSignature: '3/4',
        actions: grid(12, [
          [0, relativePick('bass')],
          [4, strum('D', range('middle', 'top'), ['accent'])],
          [8, strum('U', range('top', 'middle'))]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-6-8-ballad',
      name: '6/8 Ballad',
      description: 'Rolling compound-time strum for emotional acoustic ballads that need motion without losing warmth.',
      category: 'Campfire',
      suggestedGenre: 'Acoustic Ballad',
      exampleSong: 'Nothing Else Matters',
      measures: [{
        timeSignature: '6/8',
        actions: grid(12, [
          [0, strum('D', range('bass', 'top'), ['accent'])],
          [4, strum('D', range('middle', 'top'))],
          [6, strum('U', range('top', 'second-from-top'))],
          [8, strum('D', range('bass', 'top'))],
          [10, strum('U', range('top', 'middle'))]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-shuffle-drive-12-8',
      name: 'Shuffle Drive 12/8',
      description: 'Swung acoustic shuffle for roots-rock and bluesy campfire jams with a strong downbeat and lifted answer.',
      category: 'Campfire',
      suggestedGenre: 'Roots-Rock Shuffle',
      exampleSong: 'Proud Mary',
      measures: [{
        timeSignature: '12/8',
        actions: grid(24, [
          [0, strum('D', range('bass', 'middle'), ['palm-mute'])],
          [4, strum('D', range('bass', 'middle'), ['palm-mute'])],
          [6, strum('U', range('top', 'middle'))],
          [8, strum('D', range('bass', 'second-from-top'), ['accent'])],
          [12, strum('D', range('bass', 'middle'), ['palm-mute'])],
          [16, strum('D', range('bass', 'middle'), ['palm-mute'])],
          [18, strum('U', range('top', 'middle'))],
          [20, strum('D', range('bass', 'second-from-top'), ['accent'])],
          [22, strum('U', range('top', 'middle'))]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-ballad-fingerpicking',
      name: 'Ballad Fingerpicking',
      description: 'Gentle role-based fingerpicking for slower songs where the vocal needs space and the guitar still feels active.',
      category: 'Fingerstyle',
      suggestedGenre: 'Acoustic Ballad Fingerstyle',
      exampleSong: 'Hallelujah',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          relativePick('bass'),
          relativePick('middle'),
          relativePick('second-from-top'),
          relativePick('middle'),
          relativePick('second-from-bass'),
          relativePick('second-from-top'),
          relativePick('top'),
          relativePick('second-from-top')
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-travis-picking',
      name: 'Travis Picking',
      description: 'Alternating-bass fingerstyle pattern for solo-friendly campfire playing with a built-in moving pulse.',
      category: 'Fingerstyle',
      suggestedGenre: 'Classic Fingerstyle',
      exampleSong: 'Dust in the Wind',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          relativePick('bass'),
          relativePick('second-from-top'),
          relativePick('second-from-bass'),
          relativePick('top'),
          relativePick('bass'),
          relativePick('middle'),
          relativePick('second-from-bass'),
          relativePick('second-from-top')
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-simple-arpeggio',
      name: 'Simple Arpeggio',
      description: 'Straight broken-chord pattern for intros, verses, and quieter sections where full strumming feels too dense.',
      category: 'Fingerstyle',
      suggestedGenre: 'Acoustic Arpeggio',
      exampleSong: 'House of the Rising Sun',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          relativePick('bass'),
          relativePick('middle'),
          relativePick('second-from-top'),
          relativePick('top'),
          relativePick('second-from-bass'),
          relativePick('middle'),
          relativePick('second-from-top'),
          relativePick('top')
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-percussive-campfire-groove',
      name: 'Percussive Campfire Groove',
      description: 'Expressive acoustic groove with body hits and slaps between strums for players who want a busking-style texture.',
      category: 'Campfire',
      suggestedGenre: 'Percussive Acoustic Pop',
      exampleSong: 'Hey, Soul Sister',
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('bass', 'top'), ['accent'])],
          [4, percussive('body-knock')],
          [6, strum('U', range('top', 'middle'))],
          [8, strum('D', range('bass', 'top'))],
          [12, percussive('string-slap')],
          [14, strum('U', range('top', 'middle'))]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-soft-ballad-brush',
      name: 'Soft Ballad Brush',
      description: 'Soft brush pattern for quiet verses and reflective songs where the strum should sit behind the vocal.',
      category: 'Campfire',
      suggestedGenre: 'Singer-Songwriter Ballad',
      exampleSong: 'Let It Be',
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('second-from-bass', 'top'), ['accent'])],
          [6, strum('U', range('top', 'middle'))],
          [8, strum('D', range('second-from-bass', 'top'))],
          [14, strum('U', range('top', 'middle'))]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-bass-brush-hybrid',
      name: 'Bass + Brush Hybrid',
      description: 'Alternating bass notes followed by light upper-string brushes for intimate acoustic storytelling songs.',
      category: 'Campfire',
      suggestedGenre: 'Acoustic Folk-Pop',
      exampleSong: 'Fast Car',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          relativePick('bass'),
          strum('D', range('middle', 'top')),
          relativePick('second-from-bass'),
          strum('U', range('top', 'middle')),
          relativePick('bass'),
          strum('D', range('middle', 'top'), ['accent']),
          relativePick('second-from-bass'),
          strum('U', range('top', 'second-from-top'))
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-campfire-push-chorus',
      name: 'Campfire Push Chorus',
      description: 'Louder chorus strum with accents and lifted upstrokes for the moment a singalong needs to open up.',
      category: 'Campfire',
      suggestedGenre: 'Anthemic Campfire Pop',
      exampleSong: 'Sweet Caroline',
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('bass', 'top'), ['accent'])],
          [4, strum('D', range('bass', 'top'))],
          [6, strum('U', range('top', 'middle'))],
          [8, strum('D', range('bass', 'top'), ['accent'])],
          [10, strum('U', range('top', 'middle'))],
          [12, strum('D', range('bass', 'top'))],
          [14, strum('U', range('top', 'middle'))]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-two-beat-country-train-beat',
      name: 'Two-Beat Country / Train Beat',
      description: 'Simpler two-beat country pulse that works well under mid-tempo singalongs and easy walking grooves.',
      category: 'Campfire',
      suggestedGenre: 'Country Singalong',
      exampleSong: 'Wagon Wheel',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          relativePick('bass'),
          strum('D', range('middle', 'top'), ['accent']),
          null,
          strum('U', range('top', 'middle')),
          relativePick('second-from-bass'),
          strum('D', range('middle', 'top'), ['accent']),
          null,
          strum('U', range('top', 'middle'))
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-easy-relative-arpeggio',
      name: 'Easy Relative Arpeggio',
      description: 'Accessible role-based arpeggio that keeps the harmony clear without requiring full Travis-style independence.',
      category: 'Fingerstyle',
      suggestedGenre: 'Acoustic Pop Arpeggio',
      exampleSong: 'Stand by Me',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          relativePick('bass'),
          relativePick('middle'),
          relativePick('second-from-top'),
          relativePick('middle'),
          relativePick('second-from-bass'),
          relativePick('middle'),
          relativePick('top'),
          relativePick('second-from-top')
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-6-8-fingerpicked-ballad',
      name: '6/8 Fingerpicked Ballad',
      description: 'Flowing compound-time fingerpicking pattern for dramatic ballads and quieter acoustic interludes.',
      category: 'Fingerstyle',
      suggestedGenre: '6/8 Fingerstyle Ballad',
      exampleSong: 'Nothing Else Matters',
      measures: [{
        timeSignature: '6/8',
        actions: grid(12, [
          [0, relativePick('bass')],
          [2, relativePick('middle')],
          [4, relativePick('second-from-top')],
          [6, relativePick('second-from-bass')],
          [8, relativePick('middle')],
          [10, relativePick('top')]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-muted-funk-folk-groove',
      name: 'Muted Funk-Folk Groove',
      description: 'Tight muted acoustic groove for modern folk-pop songs that need motion without heavy percussion.',
      category: 'Campfire',
      suggestedGenre: 'Rhythmic Folk-Pop',
      exampleSong: 'Castle on the Hill',
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('bass', 'top'), ['accent'])],
          [4, strum('D', range('second-from-bass', 'second-from-top'), ['mute'])],
          [6, strum('U', range('top', 'middle'))],
          [8, strum('D', range('second-from-bass', 'second-from-top'), ['mute'])],
          [10, strum('U', range('top', 'middle'))],
          [12, strum('D', range('bass', 'top'))],
          [14, strum('U', range('top', 'middle'), ['mute'])]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-relative-campfire-bass-walk',
      name: 'Relative Campfire Bass Walk',
      description: 'Bass-moving acoustic pattern that adds travel between chord changes while keeping the top strings light and singable.',
      category: 'Campfire',
      suggestedGenre: 'Country-Folk Walk-Up',
      exampleSong: 'Ring of Fire',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          relativePick('bass'),
          strum('D', range('middle', 'top')),
          {
            technique: 'hammer-on',
            legatoMode: 'relative',
            legato: {
              role: 'second-from-bass',
              start: { anchor: 'base-note' },
              target: { anchor: 'grip-note', fretOffset: 0 }
            },
            modifiers: []
          },
          strum('U', range('top', 'second-from-top')),
          relativePick('second-from-bass'),
          strum('D', range('middle', 'top'), ['accent']),
          relativePick('bass'),
          strum('U', range('top', 'middle'))
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
        {
      id: 'default-hammer-on-campfire-drive',
      name: 'Hammer-On Campfire Drive',
      description: 'Upbeat hammer-on groove with quick down/up brush fills for lifting a campfire song into a more driving chorus feel.',
      category: 'Campfire',
      suggestedGenre: 'Driving Country-Folk',
      exampleSong: 'Wagon Wheel',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          relativePick('bass'),
          strum('D', range('second-from-bass', 'top')),
          {
            technique: 'hammer-on',
            legatoMode: 'relative',
            legato: {
              role: 'second-from-bass',
              start: { anchor: 'base-note' },
              target: { anchor: 'grip-note', fretOffset: 0 }
            },
            modifiers: []
          },
          [
            strum('D', range('middle', 'top')),
            strum('U', range('top', 'middle'))
          ],
          relativePick('bass'),
          strum('D', range('second-from-bass', 'top')),
          {
            technique: 'hammer-on',
            legatoMode: 'relative',
            legato: {
              role: 'second-from-bass',
              start: { anchor: 'base-note' },
              target: { anchor: 'grip-note', fretOffset: 0 }
            },
            modifiers: []
          },
          [
            strum('D', range('middle', 'top')),
            strum('U', range('top', 'middle'))
          ]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    }
  ];
}

function grid(totalSlots: number, entries: Array<[number, PlayingAction]>): (PlayingAction | null)[] {
  const actions: (PlayingAction | null)[] = Array(totalSlots).fill(null);

  for (const [index, action] of entries) {
    actions[index] = action;
  }

  return actions;
}

function onEighthSlots(totalSlots: number, actions: (PlayingAction | [PlayingAction, PlayingAction] | null)[]): (PlayingAction | null)[] {
  const gridActions: (PlayingAction | null)[] = Array(totalSlots).fill(null);

  for (let index = 0; index < actions.length; index++) {
    const action = actions[index];
    if (Array.isArray(action)) {
      gridActions[index * 2] = action[0];
      gridActions[index * 2 + 1] = action[1];
    } else {
      gridActions[index * 2] = action;
    }
  }

  return gridActions;
}

function strum(direction: StrumDirection, strings: StrumRange, modifiers: PlayingAction['modifiers'] = []): PlayingAction {
  return {
    technique: 'strum',
    strum: { direction, strings },
    modifiers
  };
}

function relativePick(role: RelativeStringRole, modifiers: PlayingAction['modifiers'] = []): PlayingAction {
  return {
    technique: 'pick',
    pickMode: 'relative',
    pick: [{ role, anchor: 'grip-note', fretOffset: 0 }],
    modifiers
  };
}

function range(from: RelativeStringRole, to: RelativeStringRole): StrumRange {
  return { from, to };
}

function percussive(technique: 'body-knock' | 'string-slap'): PlayingAction {
  return {
    technique: 'percussive',
    percussive: { technique }
  };
}
