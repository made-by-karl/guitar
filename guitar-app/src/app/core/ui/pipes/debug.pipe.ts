import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'debug'
})
export class DebugPipe implements PipeTransform {

  transform<T>(value: T, message?: string): T {
    console.log(message ?? 'DebugPipe', value);
    return value;
  }

}
