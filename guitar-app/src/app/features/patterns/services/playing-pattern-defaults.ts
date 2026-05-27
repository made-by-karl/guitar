import {
  PlayingAction,
  PlayingPattern,
  RelativeString,
  StrumDirection,
  StrumRange
} from '@/app/features/patterns/services/playing-patterns.model';

export function createDefaultPlayingPatterns(now: number = Date.now()): PlayingPattern[] {
  // use id: 'default-<short-name-slug>'
  return [
    {
      id: 'default-steady-downstrokes-4-4',
      name: 'Steady Downstrokes (4/4)',
      description: 'Plain quarter-note downstrokes for learning chord changes, leading a group, or keeping a verse simple.',
      category: 'Campfire',
      suggestedGenre: 'Campfire Basics',
      exampleSong: "Knockin' on Heaven's Door",
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('bass', 'top'), ['accent'])],
          [4, strum('D', range('bass', 'top'))],
          [8, strum('D', range('bass', 'top'), ['accent'])],
          [12, strum('D', range('bass', 'top'))]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-folk-strum-d-d-u-u-d-u',
      name: 'Folk Strum (D-D-U-U-D-U)',
      description: 'The familiar campfire strum for mid-tempo singalongs and open-chord standards.',
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
      id: 'default-roll-strum-d-du-udu',
      name: 'Roll Strum (D-DU-UDU)',
      description: 'A tighter rolling strum that adds motion without sounding too busy under the vocal.',
      category: 'Campfire',
      suggestedGenre: 'Acoustic Pop',
      exampleSong: 'Wonderwall',
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('bass', 'top'))],
          [4, strum('D', range('bass', 'top'))],
          [6, strum('U', range('top', 'middle'))],
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
      id: 'default-country-roads-strum-d-dud-du',
      name: 'Country Roads Strum (D-DUD-DU)',
      description: 'A relaxed country-folk groove with a held second beat and a pickup into the next bar.',
      category: 'Campfire',
      suggestedGenre: 'Country / Folk Singalong',
      exampleSong: 'Take Me Home, Country Roads',
      measures: [{
        timeSignature: '4/4',
        actions: onEighthSlots(16, [
          strum('D', range('bass', 'top')),
          null,
          strum('D', range('bass', 'top')),
          strum('U', range('top', 'middle')),
          strum('D', range('bass', 'top')),
          null,
          strum('D', range('bass', 'top')),
          strum('U', range('top', 'middle'))
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-boom-chick-bass-brush',
      name: 'Boom-Chick Bass + Brush',
      description: 'Alternating bass notes with short brushes for songs that need a clear pulse and a little low-end movement.',
      category: 'Campfire',
      suggestedGenre: 'Country / Americana',
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
      id: 'default-soft-ballad-brush',
      name: 'Soft Ballad Brush',
      description: 'Light brushes with extra space for quiet verses, reflective ballads, and slower vocal-led sections.',
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
      id: 'default-campfire-backbeat-tap',
      name: 'Campfire Backbeat Tap',
      description: 'A simple singalong strum with light body taps on the backbeat for adding pulse without turning busy.',
      category: 'Campfire',
      suggestedGenre: 'Campfire Singalong',
      exampleSong: 'Stand by Me',
      measures: [{
        timeSignature: '4/4',
        actions: grid(16, [
          [0, strum('D', range('bass', 'top'), ['accent'])],
          [4, percussive('body-knock')],
          [6, strum('U', range('top', 'middle'))],
          [8, strum('D', range('bass', 'top'))],
          [12, percussive('body-knock')],
          [14, strum('U', range('top', 'middle'))]
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
          [
            relativeBasePick('second-from-bass'),
            {
              technique: 'hammer-on',
              legatoMode: 'relative',
              legato: {
                string: 'second-from-bass',
                target: { anchor: 'grip-note', fretOffset: 0 }
              }
            }
          ],
          [
            strum('D', range('middle', 'top')),
            strum('U', range('top', 'middle'))
          ],
          relativePick('bass'),
          strum('D', range('second-from-bass', 'top')),
          [
            relativeBasePick('second-from-bass'),
            {
              technique: 'hammer-on',
              legatoMode: 'relative',
              legato: {
                string: 'second-from-bass',
                target: { anchor: 'grip-note', fretOffset: 0 }
              }
            }
          ],
          [
            strum('D', range('middle', 'top')),
            strum('U', range('top', 'middle'))
          ]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-waltz-bass-brush-3-4',
      name: 'Waltz Bass + Brush (3/4)',
      description: 'Bass on beat one with light upper-string brushes for songs in three that still need a steady singalong feel.',
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
      id: 'default-ballad-strum-6-8',
      name: '6/8 Ballad Strum',
      description: 'A flowing compound-time strum for slow 6/8 songs where the guitar should keep moving under the vocal.',
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
      id: 'default-chorus-lift-strum',
      name: 'Chorus Lift Strum',
      description: 'A brighter, more open strum for choruses or any section that needs more lift than the basic verse groove.',
      category: 'Campfire',
      suggestedGenre: 'Anthemic Singalong',
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
          [14, strum('U', range('top', 'middle'), ['accent'])]
        ])
      }],
      createdAt: now,
      updatedAt: now,
      isCustom: false
    },
    {
      id: 'default-bass-treble-arpeggio',
      name: 'Bass-Treble Arpeggio',
      description: 'A simple bass-to-treble broken-chord pattern for quiet verses, intros, and first fingerstyle practice.',
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
      id: 'default-travis-alternating-bass',
      name: 'Travis Alternating Bass',
      description: 'Alternating bass with single treble notes for the classic steady-thumb feel that still supports singing.',
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
      id: 'default-bass-pinch-6-8',
      name: '6/8 Bass + Pinch',
      description: 'Bass-led 6/8 fingerstyle with treble pinches that keeps compound-time ballads full but easy to follow.',
      category: 'Fingerstyle',
      suggestedGenre: 'Fingerstyle Ballad',
      exampleSong: 'Hallelujah',
      measures: [{
        timeSignature: '6/8',
        actions: grid(12, [
          [0, relativePinch(['bass', 'second-from-top', 'top'])],
          [2, relativePick('middle')],
          [4, relativePick('second-from-top')],
          [6, relativePinch(['second-from-bass', 'second-from-top', 'top'])],
          [8, relativePick('middle')],
          [10, relativePick('second-from-top')]
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

function relativePick(string: RelativeString, fretOffset: number = 0, modifiers: PlayingAction['modifiers'] = []): PlayingAction {
  return {
    technique: 'pick',
    pickMode: 'relative',
    pick: [{ string, anchor: 'grip-note', fretOffset }],
    modifiers
  };
}

function relativeBasePick(string: RelativeString, modifiers: PlayingAction['modifiers'] = []): PlayingAction {
  return {
    technique: 'pick',
    pickMode: 'relative',
    pick: [{ string, anchor: 'base-note' }],
    modifiers
  };
}

function relativePinch(strings: RelativeString[], modifiers: PlayingAction['modifiers'] = []): PlayingAction {
  return {
    technique: 'pick',
    pickMode: 'relative',
    pick: strings.map(string => ({
      string,
      anchor: 'grip-note' as const,
      fretOffset: 0
    })),
    modifiers
  };
}

function range(from: RelativeString, to: RelativeString): StrumRange {
  return { from, to };
}

function percussive(technique: 'body-knock' | 'string-slap'): PlayingAction {
  return {
    technique: 'percussive',
    percussive: { technique }
  };
}
