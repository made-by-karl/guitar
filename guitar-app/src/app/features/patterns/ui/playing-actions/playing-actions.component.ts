import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LegatoNote,
  PlayingAction,
  RelativeLegatoEndpointNote,
  RelativeNoteAnchor,
  RelativeStringRole,
  getLegatoMode,
  getPickMode,
  isRelativeStrumRange,
  isBaseRelativeLegatoEndpoint,
  isRelativeLegatoNote,
  isRelativePickingNote
} from '@/app/features/patterns/services/playing-patterns.model';

@Component({
  selector: 'app-playing-actions',
  imports: [CommonModule],
  templateUrl: './playing-actions.component.html',
  styleUrl: './playing-actions.component.scss'
})
export class PlayingActionsComponent {
  actions = input.required<(PlayingAction | null)[]>();
  showActionIndex = input<boolean>(false);

  getPickModeLabel(action: PlayingAction): string {
    return getPickMode(action);
  }

  getPickTitle(actionIndex: number, action: PlayingAction): string {
    if (getPickMode(action) !== 'relative' || !action.pick || action.pick.length === 0) {
      return `Action ${actionIndex} - Pick ${action.pick?.length || 0} note(s) in ${getPickMode(action)} mode`;
    }

    const details = action.pick.map(note => {
      if (!isRelativePickingNote(note)) {
        return `string ${(note.string ?? 0) + 1}`;
      }

      if (note.anchor === 'base-note') {
        return `${this.getRoleLabel(note.role)} at base`;
      }

      return `${this.getRoleLabel(note.role)} at grip ${note.fretOffset >= 0 ? '+' : ''}${note.fretOffset}`;
    }).join(', ');

    return `Action ${actionIndex} - Pick ${details}`;
  }

  getLegatoTitle(actionIndex: number, label: string, action: PlayingAction): string {
    const legato = action.legato;
    if (!legato) {
      return `Action ${actionIndex} - ${label}`;
    }

    if (getLegatoMode(action) === 'relative' && isRelativeLegatoNote(legato)) {
      return `Action ${actionIndex} - ${label} on ${this.getRoleLabel(legato.role)} from ${this.getLegatoEndpointLabel(legato.start)} to ${this.getLegatoEndpointLabel(legato.target)}`;
    }

    const explicitLegato = legato as Extract<LegatoNote, { string: number; fromFret: number; toFret: number }>;
    return `Action ${actionIndex} - ${label} on string ${(explicitLegato.string ?? 0) + 1} from fret ${explicitLegato.fromFret ?? 0} to fret ${explicitLegato.toFret ?? 0}`;
  }

  getStrumTitle(actionIndex: number, action: PlayingAction): string {
    const direction = action.strum?.direction === 'D' ? 'Down' : 'Up';
    const strings = this.getStrumStringsLabel(action);
    const modifiers = action.modifiers?.length ? ` (${action.modifiers.join(', ')})` : '';
    return `Action ${actionIndex} - Strum ${direction} on ${strings}${modifiers}`;
  }

  private getAnchorLabel(anchor: RelativeNoteAnchor): string {
    return anchor === 'base-note' ? 'base' : 'grip';
  }

  private getLegatoEndpointLabel(endpoint: RelativeLegatoEndpointNote): string {
    if (isBaseRelativeLegatoEndpoint(endpoint)) {
      return 'base';
    }

    return `grip ${endpoint.fretOffset >= 0 ? '+' : ''}${endpoint.fretOffset}`;
  }

  private getRoleLabel(role: RelativeStringRole): string {
    switch (role) {
      case 'bass': return 'bass note';
      case 'second-from-bass': return '2nd from bass';
      case 'middle': return 'middle string';
      case 'second-from-top': return '2nd from top';
      case 'top': return 'top note';
    }
  }

  private getStrumStringsLabel(action: PlayingAction): string {
    const strings = action.strum?.strings;
    if (!strings) {
      return 'all strings';
    }

    if (isRelativeStrumRange(strings)) {
      return `${this.getRoleLabel(strings.from)} to ${this.getRoleLabel(strings.to)}`;
    }

    return `${strings} strings`;
  }
}
