import { PlayingPattern } from './playing-patterns.model';

export function cloneMeasure<T extends PlayingPattern['measures'][number]>(measure: T): T {
  return {
    ...measure,
    actionGrips: measure.actionGrips?.map(grip => ({ ...grip })),
    actions: measure.actions.map(action => action ? {
      ...action,
      modifiers: action.modifiers ? [...action.modifiers] : undefined,
      strum: action.strum ? { ...action.strum, strings: Array.isArray(action.strum.strings) ? [...action.strum.strings] : typeof action.strum.strings === 'object' ? { ...action.strum.strings } : action.strum.strings } : undefined,
      pick: action.pick ? action.pick.map(note => ({ ...note })) : undefined,
      slide: action.slide ? { ...action.slide } : undefined,
      legato: action.legato ? ('target' in action.legato
        ? { ...action.legato, target: { ...action.legato.target } }
        : { ...action.legato }) : undefined,
      percussive: action.percussive ? { ...action.percussive } : undefined
    } : null)
  };
}
