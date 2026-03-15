import { DebugPipe } from '@/app/core/ui/pipes/debug.pipe';

describe('DebugPipe', () => {
  it('create an instance', () => {
    const pipe = new DebugPipe();
    expect(pipe).toBeTruthy();
  });
});
